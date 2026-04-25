import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, MapPin, Pencil, Trash2 } from "lucide-react";

interface Site {
  id: string;
  name: string;
  location: string | null;
  status: string;
  area_acres: number | null;
  notes: string | null;
}

const statusVariant = (s: string) =>
  s === "active" ? "default" : s === "completed" ? "outline" : "secondary";

const Sites = () => {
  const { role } = useAuth();
  const isHod = role === "hod";
  const [sites, setSites] = useState<Site[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Site | null>(null);

  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [status, setStatus] = useState("pending");
  const [area, setArea] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => { document.title = "Land Sites — HOD Console"; }, []);

  const load = async () => {
    const { data } = await supabase
      .from("land_sites")
      .select("*")
      .order("created_at", { ascending: false });
    setSites((data ?? []) as Site[]);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel("sites-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "land_sites" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const reset = () => {
    setName(""); setLocation(""); setStatus("pending"); setArea(""); setNotes("");
    setEditing(null);
  };

  const openEdit = (s: Site) => {
    setEditing(s);
    setName(s.name);
    setLocation(s.location ?? "");
    setStatus(s.status);
    setArea(s.area_acres?.toString() ?? "");
    setNotes(s.notes ?? "");
    setOpen(true);
  };

  const save = async () => {
    if (!name.trim()) return toast.error("Name required");
    const payload = {
      name: name.trim(),
      location: location.trim() || null,
      status,
      area_acres: area ? Number(area) : null,
      notes: notes.trim() || null,
    };
    if (editing) {
      const { error } = await supabase.from("land_sites").update(payload).eq("id", editing.id);
      if (error) return toast.error(error.message);
      toast.success("Site updated");
    } else {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("land_sites").insert({ ...payload, created_by: u.user!.id });
      if (error) return toast.error(error.message);
      toast.success("Site added");
    }
    reset();
    setOpen(false);
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this site?")) return;
    const { error } = await supabase.from("land_sites").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Site deleted");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-serif text-2xl font-semibold">Land Sites</h2>
          <p className="text-sm text-muted-foreground">
            {isHod ? "Manage all land sites" : "View land sites"}
          </p>
        </div>
        {isHod && (
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 h-4 w-4" /> Add site</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="font-serif">{editing ? "Edit site" : "Add site"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-2"><Label>Name</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} />
                </div>
                <div className="space-y-2"><Label>Location</Label>
                  <Input value={location} onChange={(e) => setLocation(e.target.value)} maxLength={200} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2"><Label>Status</Label>
                    <Select value={status} onValueChange={setStatus}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2"><Label>Area (acres)</Label>
                    <Input type="number" value={area} onChange={(e) => setArea(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-2"><Label>Notes</Label>
                  <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} />
                </div>
              </div>
              <DialogFooter><Button onClick={save}>{editing ? "Save" : "Add"}</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {sites.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center gap-2 py-12 text-center">
          <MapPin className="h-10 w-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No sites yet.</p>
        </CardContent></Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {sites.map((s) => (
            <Card key={s.id} className="shadow-card">
              <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                <div>
                  <CardTitle className="font-serif text-base">{s.name}</CardTitle>
                  {s.location && <p className="mt-1 text-xs text-muted-foreground">{s.location}</p>}
                </div>
                <Badge variant={statusVariant(s.status) as any}>{s.status}</Badge>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  {s.area_acres !== null && <span>{s.area_acres} acres</span>}
                </div>
                {s.notes && <p className="text-sm">{s.notes}</p>}
                {isHod && (
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => openEdit(s)}>
                      <Pencil className="mr-1 h-3 w-3" /> Edit
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(s.id)}>
                      <Trash2 className="mr-1 h-3 w-3" /> Delete
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default Sites;
