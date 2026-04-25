
-- Roles enum and table
CREATE TYPE public.app_role AS ENUM ('hod', 'staff');

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer role check
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.get_current_role()
RETURNS public.app_role
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.user_roles WHERE user_id = auth.uid() ORDER BY
    CASE role WHEN 'hod' THEN 1 ELSE 2 END LIMIT 1
$$;

-- Auto-create profile + default staff role on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), NEW.email);

  INSERT INTO public.user_roles (user_id, role)
  VALUES (
    NEW.id,
    COALESCE((NEW.raw_user_meta_data->>'role')::public.app_role, 'staff'::public.app_role)
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Profiles RLS
CREATE POLICY "Users view own profile" ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "HOD views all profiles" ON public.profiles
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'hod'));
CREATE POLICY "Users update own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id);

-- user_roles RLS
CREATE POLICY "Users view own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "HOD views all roles" ON public.user_roles
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'hod'));
CREATE POLICY "HOD manages roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'hod'))
  WITH CHECK (public.has_role(auth.uid(), 'hod'));

-- LAND SITES
CREATE TABLE public.land_sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  location TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('active','pending','completed')),
  area_acres NUMERIC,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.land_sites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read sites" ON public.land_sites
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "HOD manages sites" ON public.land_sites
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'hod'))
  WITH CHECK (public.has_role(auth.uid(), 'hod'));

-- CRITICAL ALERTS
CREATE TABLE public.critical_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','high','critical')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  remarks TEXT,
  site_id UUID REFERENCES public.land_sites(id) ON DELETE SET NULL,
  submitted_by UUID REFERENCES auth.users(id),
  resolved_by UUID REFERENCES auth.users(id),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.critical_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff view own alerts" ON public.critical_alerts
  FOR SELECT TO authenticated USING (submitted_by = auth.uid());
CREATE POLICY "HOD views all alerts" ON public.critical_alerts
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'hod'));
CREATE POLICY "Authenticated submit alerts" ON public.critical_alerts
  FOR INSERT TO authenticated WITH CHECK (submitted_by = auth.uid());
CREATE POLICY "HOD updates alerts" ON public.critical_alerts
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'hod'));

-- APPROVALS
CREATE TABLE public.approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  request_type TEXT NOT NULL DEFAULT 'general',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  comments TEXT,
  amount NUMERIC,
  site_id UUID REFERENCES public.land_sites(id) ON DELETE SET NULL,
  requested_by UUID REFERENCES auth.users(id),
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.approvals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff view own approvals" ON public.approvals
  FOR SELECT TO authenticated USING (requested_by = auth.uid());
CREATE POLICY "HOD views all approvals" ON public.approvals
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'hod'));
CREATE POLICY "Authenticated submit approvals" ON public.approvals
  FOR INSERT TO authenticated WITH CHECK (requested_by = auth.uid());
CREATE POLICY "HOD reviews approvals" ON public.approvals
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'hod'));

-- updated_at trigger for sites
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_sites_updated BEFORE UPDATE ON public.land_sites
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
