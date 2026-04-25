import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, CheckSquare } from "lucide-react";

interface Approval {
  id: string;
  title: string;
  description: string | null;
  status: string;
  comments: string | null;
  amount: number | null;
  created_at: string;
}

const Approvals = () => {
  const { role } = useAuth();
  const [items, setItems] = useState<Approval[]>([]);
  const [open, setOpen] = useState(false);
  const [reviewItem, setReviewItem] = useState<Approval | null>(null);
  const [comments, setComments] = useState("");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");

  useEffect(() => { document.title = "Approvals — HOD Console"; }, []);

  const load = async () => {
    const { data } = await supabase
      .from("approvals")
      .select("*")
      .order("created_at", { ascending: false });
    setItems((data ?? []) as Approval[]);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel("approvals-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "approvals" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const submit = async () => {
    if (!title.trim()) return toast.error("Title required");
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("approvals").insert({
      title: title.trim(),
      description: description.trim() || null,
      amount: amount ? Number(amount) : null,
      requested_by: u.user!.id,
    });
    if (error) return toast.error(error.message);
    toast.success("Request submitted");
    setTitle(""); setDescription(""); setAmount("");
    setOpen(false);
  };

  const decide = async (decision: "approved" | "rejected") => {
    if (!reviewItem) return;
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("approvals")
      .update({
        status: decision,
        comments: comments.trim() || null,
        reviewed_by: u.user!.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", reviewItem.id);
    if (error) return toast.error(error.message);
    toast.success(`Request ${decision}`);
    setReviewItem(null);
    setComments("");
  };

  const statusVariant = (s: string) =>
    s === "approved" ? "default" : s === "rejected" ? "destructive" : "secondary";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-serif text-2xl font-semibold">Approvals</h2>
          <p className="text-sm text-muted-foreground">
            {role === "hod" ? "Review staff requests" : "Submit approval requests"}
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" /> New request</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle className="font-serif">Submit request</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-2"><Label>Title</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
              </div>
              <div className="space-y-2"><Label>Description</Label>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} />
              </div>
              <div className="space-y-2"><Label>Amount (optional)</Label>
                <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
            </div>
            <DialogFooter><Button onClick={submit}>Submit</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {items.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center gap-2 py-12 text-center">
          <CheckSquare className="h-10 w-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No requests yet.</p>
        </CardContent></Card>
      ) : (
        <div className="grid gap-3">
          {items.map((a) => (
            <Card key={a.id} className="shadow-card">
              <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                <div>
                  <CardTitle className="font-serif text-base">{a.title}</CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">{new Date(a.created_at).toLocaleString()}</p>
                </div>
                <Badge variant={statusVariant(a.status) as any}>{a.status}</Badge>
              </CardHeader>
              <CardContent className="space-y-3">
                {a.description && <p className="text-sm">{a.description}</p>}
                {a.amount !== null && <p className="text-sm font-medium">Amount: ₹{a.amount.toLocaleString()}</p>}
                {a.comments && (
                  <p className="rounded-md bg-muted p-3 text-sm">
                    <span className="font-medium">Comments: </span>{a.comments}
                  </p>
                )}
                {role === "hod" && a.status === "pending" && (
                  <Button size="sm" variant="outline" onClick={() => setReviewItem(a)}>Review</Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!reviewItem} onOpenChange={(v) => !v && setReviewItem(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle className="font-serif">Review request</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label>Comments</Label>
            <Textarea value={comments} onChange={(e) => setComments(e.target.value)} maxLength={1000} />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="destructive" onClick={() => decide("rejected")}>Reject</Button>
            <Button onClick={() => decide("approved")}>Approve</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Approvals;
