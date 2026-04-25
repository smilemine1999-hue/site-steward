import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, CheckSquare, MapPin, Wallet } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface Stats {
  alerts: number;
  pendingApprovals: number;
  activeSites: number;
  paymentsPending: number;
}

const weeklyData = [
  { day: "Mon", alerts: 3, approvals: 5 },
  { day: "Tue", alerts: 5, approvals: 2 },
  { day: "Wed", alerts: 2, approvals: 7 },
  { day: "Thu", alerts: 6, approvals: 4 },
  { day: "Fri", alerts: 4, approvals: 6 },
  { day: "Sat", alerts: 1, approvals: 3 },
  { day: "Sun", alerts: 2, approvals: 1 },
];

const monthlyData = [
  { month: "Jan", value: 24 },
  { month: "Feb", value: 32 },
  { month: "Mar", value: 28 },
  { month: "Apr", value: 41 },
  { month: "May", value: 36 },
  { month: "Jun", value: 47 },
];

const Dashboard = () => {
  const { role, user } = useAuth();
  const [stats, setStats] = useState<Stats>({
    alerts: 0,
    pendingApprovals: 0,
    activeSites: 0,
    paymentsPending: 0,
  });

  useEffect(() => {
    document.title = "Dashboard — HOD Console";
  }, []);

  const loadStats = async () => {
    const [alerts, approvals, sites] = await Promise.all([
      supabase.from("critical_alerts").select("id", { count: "exact", head: true }).eq("status", "open"),
      supabase.from("approvals").select("id", { count: "exact", head: true }).eq("status", "pending"),
      supabase.from("land_sites").select("id", { count: "exact", head: true }).eq("status", "active"),
    ]);
    setStats({
      alerts: alerts.count ?? 0,
      pendingApprovals: approvals.count ?? 0,
      activeSites: sites.count ?? 0,
      paymentsPending: 0,
    });
  };

  useEffect(() => {
    loadStats();
    const channel = supabase
      .channel("dashboard-stats")
      .on("postgres_changes", { event: "*", schema: "public", table: "critical_alerts" }, loadStats)
      .on("postgres_changes", { event: "*", schema: "public", table: "approvals" }, loadStats)
      .on("postgres_changes", { event: "*", schema: "public", table: "land_sites" }, loadStats)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const cards = [
    { label: "Open Alerts", value: stats.alerts, icon: AlertTriangle, tone: "text-destructive bg-destructive/10" },
    { label: "Pending Approvals", value: stats.pendingApprovals, icon: CheckSquare, tone: "text-warning bg-warning/10" },
    { label: "Active Sites", value: stats.activeSites, icon: MapPin, tone: "text-success bg-success/10" },
    { label: "Payments Pending", value: stats.paymentsPending, icon: Wallet, tone: "text-primary bg-primary/10" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-serif text-2xl font-semibold">
          {role === "hod" ? "Department Overview" : "My Workspace"}
        </h2>
        <p className="text-sm text-muted-foreground">
          Welcome back{user?.email ? `, ${user.email}` : ""}. Here&apos;s today&apos;s snapshot.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        {cards.map((c) => (
          <Card key={c.label} className="shadow-card">
            <CardContent className="p-4">
              <div className={`mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg ${c.tone}`}>
                <c.icon className="h-5 w-5" />
              </div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{c.label}</p>
              <p className="font-serif text-3xl font-semibold">{c.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="font-serif text-lg">Weekly activity</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={weeklyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                <Bar dataKey="alerts" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="approvals" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="font-serif text-lg">Monthly trend</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                <Line type="monotone" dataKey="value" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;
