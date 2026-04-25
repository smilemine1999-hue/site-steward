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
import { Plus, AlertTriangle } from "lucide-react";

interface Alert {
  id: string;
  title: string;
  description: string | null;
  severity: string;
  status: string;
  remarks: string | null;
  created_at: string;
}

const severityTone: Record<string, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-warning/15 text-warning",
  high: "bg-accent/15 text-accent",
  critical: "bg-destructive/15 text-destructive",
};

const Alerts = () => {
  const { role } = useAuth();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [open, setOpen] = useState(false);
  const [resolveOpen, setResolveOpen] = useState<Alert | null>(null);
  const [remarks, setRemarks] = useState("");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState("medium");

  useEffect(() => { document.title = "Critical Alerts — HOD Console"; }, []);

  const load = async () => {
    const { data } = await supabase
      .from("critical_alerts")
      .select("*")
      .order("created_at", { ascending: false });
    setAlerts((data ?? []) as Alert[]);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel("alerts-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "critical_alerts" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const submit = async () => {
    if (!title.trim()) return toast.error("Title required");
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("critical_alerts").insert({
      title: title.trim(),
      description: description.trim() || null,
      severity,
      submitted_by: u.user!.id,
    });
    if (error) return toast.error(error.message);
    toast.success("Alert submitted");
    setTitle(""); setDescription(""); setSeverity("medium");
    setOpen(false);
  };

  const resolve = async () => {
    if (!resolveOpen) return;
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("critical_alerts")
      .update({
        status: "resolved",
        remarks: remarks.trim() || null,
        resolved_by: u.user!.id,
        resolved_at: new Date().toISOString(),
      })
      .eq("id", resolveOpen.id);
    if (error) return toast.error(error.message);
    toast.success("Alert resolved");
    setResolveOpen(null);
    setRemarks("");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-serif text-2xl font-semibold">Critical Alerts</h2>
          <p className="text-sm text-muted-foreground">
            {role === "hod" ? "Review and resolve incoming alerts" : "Submit and track your alerts"}
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" /> New alert</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle className="font-serif">Submit alert</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Title</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} />
              </div>
              <div className="space-y-2">
                <Label>Severity</Label>
                <Select value={severity} onValueChange={setSeverity}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter><Button onClick={submit}>Submit</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {alerts.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center gap-2 py-12 text-center">
          <AlertTriangle className="h-10 w-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No alerts yet.</p>
        </CardContent></Card>
      ) : (
        <div className="grid gap-3">
          {alerts.map((a) => (
            <Card key={a.id} className="shadow-card">
              <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                <div>
                  <CardTitle className="font-serif text-base">{a.title}</CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {new Date(a.created_at).toLocaleString()}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Badge className={severityTone[a.severity]} variant="secondary">{a.severity}</Badge>
                  <Badge variant={a.status === "resolved" ? "outline" : "default"}>{a.status}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {a.description && <p className="text-sm">{a.description}</p>}
                {a.remarks && (
                  <p className="rounded-md bg-muted p-3 text-sm">
                    <span className="font-medium">HOD remarks: </span>{a.remarks}
                  </p>
                )}
                {role === "hod" && a.status === "open" && (
                  <Button size="sm" variant="outline" onClick={() => setResolveOpen(a)}>
                    Resolve
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!resolveOpen} onOpenChange={(v) => !v && setResolveOpen(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle className="font-serif">Resolve alert</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label>Remarks (optional)</Label>
            <Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} maxLength={1000} />
          </div>
          <DialogFooter><Button onClick={resolve}>Mark resolved</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Alerts;
