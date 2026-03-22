import { Layout } from "@/components/layout/Layout";
import { 
  useGetTemple, 
  useCreateMilestone, 
  useCreateUpdate, 
  useAddContributor,
  getGetTempleQueryKey,
  CreateMilestoneInputStatus,
  CreateUpdateInputCategory
} from "@workspace/api-client-react";
import { useRoute } from "wouter";
import { useState } from "react";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ProgressBar } from "@/components/shared/ProgressBar";
import { AvatarRing } from "@/components/shared/AvatarRing";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { MapPin, User, Calendar, CheckCircle2, Circle, Clock, Plus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { milestoneFormSchema, updateFormSchema, contributorFormSchema } from "@/lib/schemas";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";

type Tab = "overview" | "milestones" | "updates" | "contributors";

export default function TempleDetail() {
  const [, params] = useRoute("/temples/:id");
  const templeId = parseInt(params?.id || "0");
  const { data: temple, isLoading } = useGetTemple(templeId);
  const [activeTab, setActiveTab] = useState<Tab>("overview");

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-[60vh]">
          <div className="w-16 h-16 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
        </div>
      </Layout>
    );
  }

  if (!temple) return <Layout><div>Temple not found</div></Layout>;

  const coverImg = temple.coverImage || `${import.meta.env.BASE_URL}images/temple-placeholder.png`;

  return (
    <Layout>
      <div className="pb-16 space-y-8">
        {/* Header Hero */}
        <div className="relative h-[300px] md:h-[400px] rounded-3xl overflow-hidden shadow-lg border-0 bg-card">
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/10 z-10" />
          <img src={coverImg} alt={temple.name} className="w-full h-full object-cover" />
          
          <div className="absolute bottom-0 left-0 right-0 p-8 md:p-12 z-20">
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <StatusBadge status={temple.status} className="bg-white/10 backdrop-blur-md text-white ring-white/30" />
              <span className="px-3 py-1 rounded-full bg-primary text-primary-foreground text-xs font-semibold tracking-wider">
                {temple.phase}
              </span>
            </div>
            <h1 className="text-4xl md:text-6xl font-serif font-bold text-white mb-2 leading-tight drop-shadow-md">
              {temple.name}
            </h1>
            <div className="flex flex-wrap items-center gap-6 text-white/90 font-medium">
              <span className="flex items-center gap-1.5"><MapPin className="w-4 h-4" /> {temple.location}</span>
              <span className="flex items-center gap-1.5"><User className="w-4 h-4" /> Deity: {temple.deity}</span>
            </div>
          </div>
        </div>

        {/* Custom Tab Navigation */}
        <div className="flex gap-2 overflow-x-auto hide-scrollbar bg-card p-2 rounded-2xl shadow-sm border-0 w-fit">
          {(["overview", "milestones", "updates", "contributors"] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`relative px-6 py-3 rounded-xl font-semibold text-sm capitalize transition-colors ${
                activeTab === tab ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-black/5"
              }`}
            >
              {activeTab === tab && (
                <motion.div 
                  layoutId="activeTab" 
                  className="absolute inset-0 bg-primary rounded-xl shadow-md shadow-primary/20"
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                />
              )}
              <span className="relative z-10">{tab}</span>
            </button>
          ))}
        </div>

        {/* Tab Content Area */}
        <div className="bg-card rounded-3xl p-8 shadow-sm border-0 min-h-[400px]">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {activeTab === "overview" && <OverviewTab temple={temple} />}
              {activeTab === "milestones" && <MilestonesTab templeId={temple.id} milestones={temple.milestones} />}
              {activeTab === "updates" && <UpdatesTab templeId={temple.id} updates={temple.updates} />}
              {activeTab === "contributors" && <ContributorsTab templeId={temple.id} contributors={temple.contributors} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </Layout>
  );
}

// --- TAB COMPONENTS ---

function OverviewTab({ temple }: { temple: any }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
      <div className="lg:col-span-2 space-y-8">
        <div>
          <h3 className="text-2xl font-serif font-bold text-foreground mb-4">Vision & Description</h3>
          <p className="text-muted-foreground leading-relaxed whitespace-pre-wrap">{temple.description}</p>
        </div>
        
        <div className="grid grid-cols-2 gap-6 bg-background rounded-2xl p-6 border-0 shadow-inner">
          <div>
            <p className="text-sm text-muted-foreground mb-1 uppercase tracking-wider font-semibold">Start Date</p>
            <p className="text-lg font-bold text-foreground flex items-center gap-2">
              <Calendar className="w-5 h-5 text-primary" /> {format(new Date(temple.startDate), 'MMMM d, yyyy')}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground mb-1 uppercase tracking-wider font-semibold">Target Completion</p>
            <p className="text-lg font-bold text-foreground flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-500" /> {format(new Date(temple.expectedCompletion), 'MMMM d, yyyy')}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-8">
        <div className="bg-background rounded-2xl p-6 shadow-sm border border-border/50">
          <h3 className="font-serif font-bold text-lg mb-6">Project Progress</h3>
          <div className="space-y-6">
            <ProgressBar value={temple.constructionProgress} label="Construction Status" size="lg" />
            <div className="pt-2 border-t border-border">
              <ProgressBar 
                value={temple.fundraisingRaised} 
                max={temple.fundraisingGoal} 
                label="Fundraising Goal" 
                size="lg" 
              />
              <div className="flex justify-between text-xs mt-2 font-medium">
                <span className="text-muted-foreground">₹{(temple.fundraisingRaised / 10000000).toFixed(2)}Cr raised</span>
                <span className="text-muted-foreground">₹{(temple.fundraisingGoal / 10000000).toFixed(2)}Cr target</span>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-background rounded-2xl p-6 shadow-sm border border-border/50">
           <h3 className="font-serif font-bold text-lg mb-4">Leadership</h3>
           <div className="flex items-center gap-4">
             <AvatarRing initials={temple.projectLead.charAt(0)} size="md" />
             <div>
               <p className="font-bold text-foreground">{temple.projectLead}</p>
               <p className="text-sm text-muted-foreground">Project Coordinator</p>
             </div>
           </div>
        </div>
      </div>
    </div>
  );
}

function MilestonesTab({ templeId, milestones }: { templeId: number, milestones: any[] }) {
  const [open, setOpen] = useState(false);
  
  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h3 className="text-2xl font-serif font-bold text-foreground">The Thread of Devotion</h3>
          <p className="text-muted-foreground">Key milestones shaping the project's journey.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <button className="flex items-center gap-2 bg-primary/10 text-primary hover:bg-primary/20 px-4 py-2.5 rounded-xl font-semibold transition-colors">
              <Plus className="w-4 h-4" /> Add Milestone
            </button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px] border-0 shadow-2xl rounded-3xl">
            <DialogHeader>
              <DialogTitle className="font-serif text-2xl">New Milestone</DialogTitle>
            </DialogHeader>
            <MilestoneForm templeId={templeId} onSuccess={() => setOpen(false)} />
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative pl-6 md:pl-10 space-y-12 before:absolute before:inset-0 before:ml-6 md:before:ml-10 before:-translate-x-px md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-primary before:via-primary/50 before:to-transparent">
        {milestones.length === 0 ? (
          <p className="text-muted-foreground py-8">No milestones defined yet.</p>
        ) : (
          milestones.map((m, i) => (
            <div key={m.id} className="relative">
              <div className="absolute -left-[35px] md:-left-[45px] top-1 bg-card rounded-full p-1 shadow-sm">
                {m.status === 'completed' ? (
                  <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                ) : m.status === 'in_progress' ? (
                  <Clock className="w-6 h-6 text-primary animate-pulse" />
                ) : (
                  <Circle className="w-6 h-6 text-muted-foreground" />
                )}
              </div>
              <div className="bg-background rounded-2xl p-6 shadow-sm border border-border/50">
                <div className="flex flex-wrap justify-between items-start gap-4 mb-2">
                  <h4 className="text-lg font-bold text-foreground">{m.title}</h4>
                  <StatusBadge status={m.status} />
                </div>
                <p className="text-muted-foreground text-sm mb-4">{m.description}</p>
                <div className="flex gap-6 text-xs font-semibold text-muted-foreground">
                  <span className="flex items-center gap-1.5"><Calendar className="w-4 h-4 text-primary" /> Target: {format(new Date(m.targetDate), 'MMM d, yyyy')}</span>
                  {m.completedDate && (
                    <span className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-emerald-500" /> Completed: {format(new Date(m.completedDate), 'MMM d, yyyy')}</span>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function UpdatesTab({ templeId, updates }: { templeId: number, updates: any[] }) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h3 className="text-2xl font-serif font-bold text-foreground">Field Reports</h3>
          <p className="text-muted-foreground">Latest updates from the ground.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <button className="flex items-center gap-2 bg-primary/10 text-primary hover:bg-primary/20 px-4 py-2.5 rounded-xl font-semibold transition-colors">
              <Plus className="w-4 h-4" /> Post Update
            </button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[600px] border-0 shadow-2xl rounded-3xl">
            <DialogHeader>
              <DialogTitle className="font-serif text-2xl">Post Field Report</DialogTitle>
            </DialogHeader>
            <UpdateForm templeId={templeId} onSuccess={() => setOpen(false)} />
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-6">
        {updates.length === 0 ? (
          <p className="text-muted-foreground">No updates posted yet.</p>
        ) : (
          updates.map((u) => (
            <div key={u.id} className="bg-background rounded-2xl p-6 shadow-sm border border-border/50">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                  <AvatarRing initials={u.author.charAt(0)} size="sm" />
                  <div>
                    <p className="font-bold text-sm text-foreground">{u.author}</p>
                    <p className="text-xs text-muted-foreground">{format(new Date(u.createdAt), 'MMMM d, yyyy')}</p>
                  </div>
                </div>
                <span className="text-xs font-semibold px-2 py-1 rounded-md bg-secondary/10 text-secondary uppercase tracking-wider">
                  {u.category}
                </span>
              </div>
              <h4 className="text-xl font-serif font-bold mb-2 text-foreground">{u.title}</h4>
              <p className="text-muted-foreground leading-relaxed whitespace-pre-wrap">{u.content}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function ContributorsTab({ templeId, contributors }: { templeId: number, contributors: any[] }) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h3 className="text-2xl font-serif font-bold text-foreground">Key Contributors</h3>
          <p className="text-muted-foreground">The devoted souls making this possible.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <button className="flex items-center gap-2 bg-primary/10 text-primary hover:bg-primary/20 px-4 py-2.5 rounded-xl font-semibold transition-colors">
              <Plus className="w-4 h-4" /> Add Contributor
            </button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px] border-0 shadow-2xl rounded-3xl">
            <DialogHeader>
              <DialogTitle className="font-serif text-2xl">Add Contributor</DialogTitle>
            </DialogHeader>
            <ContributorForm templeId={templeId} onSuccess={() => setOpen(false)} />
          </DialogContent>
        </Dialog>
      </div>

      {contributors.length === 0 ? (
        <p className="text-muted-foreground">No contributors listed yet.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {contributors.map(c => (
            <div key={c.id} className="bg-background rounded-2xl p-6 shadow-sm border border-border/50 flex flex-col items-center text-center">
              <AvatarRing src={c.avatar} initials={c.name.charAt(0)} size="lg" className="mb-4" />
              <h4 className="font-bold text-foreground text-lg">{c.name}</h4>
              <p className="text-primary text-sm font-semibold mb-2">{c.role}</p>
              <p className="text-muted-foreground text-sm line-clamp-3">{c.contribution}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


// --- FORMS FOR TABS ---

function MilestoneForm({ templeId, onSuccess }: { templeId: number, onSuccess: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const mutation = useCreateMilestone({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetTempleQueryKey(templeId) });
        toast({ title: "Milestone Added" });
        onSuccess();
      }
    }
  });

  const form = useForm<z.infer<typeof milestoneFormSchema>>({
    resolver: zodResolver(milestoneFormSchema),
    defaultValues: { title: "", description: "", status: "pending", targetDate: "" }
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(data => mutation.mutate({ id: templeId, data }))} className="space-y-4">
        <FormField control={form.control} name="title" render={({ field }) => (
          <FormItem><FormLabel>Title</FormLabel><FormControl><Input {...field} className="bg-background" /></FormControl><FormMessage /></FormItem>
        )} />
        <FormField control={form.control} name="description" render={({ field }) => (
          <FormItem><FormLabel>Description</FormLabel><FormControl><Textarea {...field} className="bg-background" /></FormControl><FormMessage /></FormItem>
        )} />
        <div className="grid grid-cols-2 gap-4">
          <FormField control={form.control} name="status" render={({ field }) => (
            <FormItem><FormLabel>Status</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl><SelectTrigger className="bg-background"><SelectValue /></SelectTrigger></FormControl>
                <SelectContent>
                  {Object.values(CreateMilestoneInputStatus).map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            <FormMessage /></FormItem>
          )} />
          <FormField control={form.control} name="targetDate" render={({ field }) => (
            <FormItem><FormLabel>Target Date</FormLabel><FormControl><Input type="date" {...field} className="bg-background" /></FormControl><FormMessage /></FormItem>
          )} />
        </div>
        <button type="submit" disabled={mutation.isPending} className="w-full bg-primary text-primary-foreground py-3 rounded-xl font-bold mt-4">
          {mutation.isPending ? "Saving..." : "Save Milestone"}
        </button>
      </form>
    </Form>
  );
}

function UpdateForm({ templeId, onSuccess }: { templeId: number, onSuccess: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const mutation = useCreateUpdate({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetTempleQueryKey(templeId) });
        toast({ title: "Update Posted" });
        onSuccess();
      }
    }
  });

  const form = useForm<z.infer<typeof updateFormSchema>>({
    resolver: zodResolver(updateFormSchema),
    defaultValues: { title: "", content: "", author: "A. Sharma", category: "general" }
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(data => mutation.mutate({ id: templeId, data }))} className="space-y-4">
        <FormField control={form.control} name="title" render={({ field }) => (
          <FormItem><FormLabel>Title</FormLabel><FormControl><Input {...field} className="bg-background" /></FormControl><FormMessage /></FormItem>
        )} />
        <FormField control={form.control} name="category" render={({ field }) => (
            <FormItem><FormLabel>Category</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl><SelectTrigger className="bg-background"><SelectValue /></SelectTrigger></FormControl>
                <SelectContent>
                  {Object.values(CreateUpdateInputCategory).map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
                </SelectContent>
              </Select>
            <FormMessage /></FormItem>
          )} />
        <FormField control={form.control} name="content" render={({ field }) => (
          <FormItem><FormLabel>Report Content</FormLabel><FormControl><Textarea rows={5} {...field} className="bg-background" /></FormControl><FormMessage /></FormItem>
        )} />
        <button type="submit" disabled={mutation.isPending} className="w-full bg-primary text-primary-foreground py-3 rounded-xl font-bold mt-4">
          {mutation.isPending ? "Posting..." : "Post Report"}
        </button>
      </form>
    </Form>
  );
}

function ContributorForm({ templeId, onSuccess }: { templeId: number, onSuccess: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const mutation = useAddContributor({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetTempleQueryKey(templeId) });
        toast({ title: "Contributor Added" });
        onSuccess();
      }
    }
  });

  const form = useForm<z.infer<typeof contributorFormSchema>>({
    resolver: zodResolver(contributorFormSchema),
    defaultValues: { name: "", role: "", contribution: "" }
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(data => mutation.mutate({ id: templeId, data }))} className="space-y-4">
        <FormField control={form.control} name="name" render={({ field }) => (
          <FormItem><FormLabel>Name</FormLabel><FormControl><Input {...field} className="bg-background" /></FormControl><FormMessage /></FormItem>
        )} />
        <FormField control={form.control} name="role" render={({ field }) => (
          <FormItem><FormLabel>Role (e.g. Lead Architect, Major Donor)</FormLabel><FormControl><Input {...field} className="bg-background" /></FormControl><FormMessage /></FormItem>
        )} />
        <FormField control={form.control} name="contribution" render={({ field }) => (
          <FormItem><FormLabel>Contribution Details</FormLabel><FormControl><Textarea {...field} className="bg-background" /></FormControl><FormMessage /></FormItem>
        )} />
        <button type="submit" disabled={mutation.isPending} className="w-full bg-primary text-primary-foreground py-3 rounded-xl font-bold mt-4">
          {mutation.isPending ? "Adding..." : "Add Contributor"}
        </button>
      </form>
    </Form>
  );
}
