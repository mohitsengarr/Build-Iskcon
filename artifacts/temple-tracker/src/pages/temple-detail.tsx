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
import { ChevronRight, ExternalLink, Calendar, CheckCircle2, Clock, Circle, Plus, User, MapPin } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useState } from "react";
import { AvatarRing } from "@/components/shared/AvatarRing";
import { format } from "date-fns";
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

export default function TempleDetail() {
  const [, params] = useRoute("/temples/:id");
  const templeId = parseInt(params?.id || "0");
  const { data: temple, isLoading } = useGetTemple(templeId);

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-[60vh]">
          <div className="w-16 h-16 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
        </div>
      </Layout>
    );
  }

  if (!temple) return <Layout><div className="p-8">Temple not found</div></Layout>;

  const progressPercentage = Math.min(100, Math.max(0, temple.constructionProgress));
  const dashOffset = 553 - (553 * progressPercentage) / 100;
  
  const raised = (temple.fundraisingRaised / 1000000).toFixed(1);
  const goal = (temple.fundraisingGoal / 1000000).toFixed(1);
  const gap = ((temple.fundraisingGoal - temple.fundraisingRaised) / 1000000).toFixed(1);
  const fundPercentage = Math.min(100, Math.max(0, (temple.fundraisingRaised / temple.fundraisingGoal) * 100));

  return (
    <Layout>
      <div className="px-4 md:px-8 max-w-screen-2xl mx-auto pb-20 space-y-12">
        
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-on-surface-variant text-sm font-medium">
          <span>Global</span>
          <ChevronRight className="w-4 h-4" />
          <span>India</span>
          <ChevronRight className="w-4 h-4" />
          <span className="text-primary font-bold">{temple.location}</span>
        </nav>

        {/* Hero Section */}
        <section className="bg-surface-container-low p-10 rounded-xl relative overflow-hidden flex flex-col lg:flex-row justify-between lg:items-end gap-8">
          <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-primary-container/10 to-transparent pointer-events-none" />
          
          <div className="relative z-10 max-w-3xl">
            <h1 className="font-serif font-bold text-5xl text-on-surface mb-6 leading-tight">{temple.name}</h1>
            <div className="flex flex-wrap items-center gap-4">
              <span className="px-4 py-1.5 rounded-full bg-primary-container text-on-primary-container font-semibold text-sm flex items-center gap-2">
                {temple.phase}
              </span>
              <span className="flex items-center gap-1.5 text-on-surface-variant font-medium">
                <MapPin className="w-4 h-4" /> {temple.location}
              </span>
            </div>
          </div>
          
          <div className="relative z-10">
            <button className="bg-primary text-on-primary px-8 py-3.5 rounded-xl font-bold text-lg hover:shadow-lg transition-all active:scale-95 cursor-pointer">
              Support Project
            </button>
          </div>
        </section>

        {/* Bento Grid */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
          
          {/* Progress Dashboard */}
          <div className="md:col-span-4 bg-surface-container p-8 rounded-xl flex flex-col items-center justify-center text-center shadow-sm">
            <h3 className="font-sans uppercase tracking-widest text-xs font-bold text-on-surface-variant mb-8">Progress Dashboard</h3>
            <div className="relative w-48 h-48 mb-8">
              <svg className="w-full h-full transform -rotate-90">
                <circle cx="96" cy="96" r="88" stroke="currentColor" strokeWidth="12" fill="transparent" className="text-surface-container-highest" />
                <circle 
                  cx="96" cy="96" r="88" 
                  stroke="currentColor" 
                  strokeWidth="12" 
                  fill="transparent" 
                  strokeDasharray="553" 
                  strokeDashoffset={dashOffset} 
                  className="text-primary transition-all duration-1000 ease-out" 
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="font-serif text-5xl font-black text-on-surface">{progressPercentage}%</span>
                <span className="text-xs uppercase tracking-tighter font-bold text-on-surface-variant mt-1">Completed</span>
              </div>
            </div>
            <p className="text-on-surface-variant font-medium text-sm">Current Phase</p>
            <p className="font-serif text-xl text-on-surface font-bold mt-1">{temple.phase}</p>
          </div>

          {/* Financial Intelligence */}
          <div className="md:col-span-8 bg-surface-container-low p-8 rounded-xl border border-outline-variant/15 flex flex-col justify-center">
            <div className="flex justify-between items-start mb-10">
              <div>
                <h3 className="font-sans uppercase tracking-widest text-xs font-bold text-on-surface-variant mb-2">Financial Intelligence</h3>
                <p className="text-3xl font-serif font-bold text-on-surface">Resource Allocation & Gap Analysis</p>
              </div>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 mb-10">
              <div className="space-y-1">
                <p className="text-xs font-bold text-on-surface-variant uppercase tracking-tighter">Total Goal</p>
                <p className="text-3xl font-bold text-on-surface">${goal}M</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-bold text-primary uppercase tracking-tighter">Amount Raised</p>
                <p className="text-3xl font-bold text-primary">${raised}M</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-bold text-error uppercase tracking-tighter">Pending Gap</p>
                <p className="text-3xl font-bold text-error">${gap}M</p>
              </div>
            </div>
            
            <div className="space-y-3">
              <div className="flex justify-between text-xs font-bold text-on-surface-variant uppercase">
                <span>Funding Status</span>
                <span>{100 - fundPercentage}% Remaining</span>
              </div>
              <div className="h-4 w-full bg-surface-container-highest rounded-full overflow-hidden flex">
                <div className="h-full bg-primary" style={{ width: `${fundPercentage}%` }}></div>
                <div className="h-full bg-error/20 flex-1"></div>
              </div>
            </div>
          </div>

          {/* Milestone Timeline */}
          <div className="md:col-span-12 bg-surface-container-low p-10 rounded-xl relative overflow-hidden">
            <div className="flex justify-between items-center mb-12">
              <h3 className="font-sans uppercase tracking-widest text-xs font-bold text-on-surface-variant">Milestone Timeline: The Thread of Devotion</h3>
              <AddMilestoneDialog templeId={temple.id} />
            </div>
            
            <div className="relative flex flex-col md:flex-row justify-between items-start gap-12 pt-4">
              {/* Connecting Line */}
              <div className="hidden md:block absolute top-6 left-0 w-full h-0.5 bg-outline-variant/30 z-0"></div>
              
              {temple.milestones.length === 0 ? (
                <p className="text-on-surface-variant text-sm w-full text-center py-4">No milestones defined.</p>
              ) : (
                temple.milestones.slice(0, 3).map((m, i) => {
                  const isCompleted = m.status === 'completed';
                  const isActive = m.status === 'in_progress';
                  return (
                    <div key={m.id} className="relative z-10 md:w-1/3 flex flex-col gap-4">
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center shadow-sm mx-auto md:mx-0
                        ${isCompleted ? 'bg-primary-container text-on-primary-container' : 
                          isActive ? 'bg-primary border-4 border-surface-container-low text-on-primary scale-110 shadow-lg' : 
                          'bg-surface-container-highest text-on-surface-variant'}
                      `}>
                        {isCompleted ? <CheckCircle2 className="w-6 h-6" /> : 
                         isActive ? <Clock className="w-6 h-6" /> : 
                         <Calendar className="w-6 h-6" />}
                      </div>
                      <div className="text-center md:text-left">
                        <span className={`text-xs font-bold uppercase tracking-widest ${isActive ? 'text-primary' : 'text-on-surface-variant'}`}>
                          {m.targetDate ? format(new Date(m.targetDate), 'MMM yyyy') : 'TBD'}
                        </span>
                        <h4 className="font-serif font-bold text-xl text-on-surface mt-1">{m.title}</h4>
                        <p className="text-on-surface-variant text-sm mt-2 leading-relaxed line-clamp-3">{m.description}</p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Tabs Section */}
        <div className="mt-8">
          <Tabs defaultValue="updates" className="w-full">
            <TabsList className="bg-surface-container-low p-1 rounded-xl w-full max-w-md h-12">
              <TabsTrigger value="updates" className="flex-1 rounded-lg data-[state=active]:bg-surface-container-lowest data-[state=active]:text-primary font-bold">
                Field Updates
              </TabsTrigger>
              <TabsTrigger value="contributors" className="flex-1 rounded-lg data-[state=active]:bg-surface-container-lowest data-[state=active]:text-primary font-bold">
                Key Contributors
              </TabsTrigger>
            </TabsList>
            
            <div className="mt-8 bg-surface-container-low rounded-xl p-8 border border-outline-variant/10">
              <TabsContent value="updates" className="mt-0">
                <div className="flex justify-between items-center mb-8">
                  <h3 className="font-serif font-bold text-2xl">Recent Field Reports</h3>
                  <AddUpdateDialog templeId={temple.id} />
                </div>
                
                {temple.updates.length === 0 ? (
                  <p className="text-on-surface-variant">No updates yet.</p>
                ) : (
                  <div className="space-y-6">
                    {temple.updates.map(u => (
                      <div key={u.id} className="bg-surface-container-lowest p-6 rounded-xl border border-outline-variant/10 shadow-sm">
                        <div className="flex justify-between items-start mb-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold">
                              {u.author.charAt(0)}
                            </div>
                            <div>
                              <p className="font-bold text-sm text-on-surface">{u.author}</p>
                              <p className="text-xs text-on-surface-variant">{format(new Date(u.createdAt), 'MMM d, yyyy')}</p>
                            </div>
                          </div>
                          <span className="text-[10px] font-bold px-2 py-1 rounded bg-secondary-container/30 text-on-secondary-container uppercase">
                            {u.category}
                          </span>
                        </div>
                        <h4 className="text-xl font-serif font-bold mb-2 text-on-surface">{u.title}</h4>
                        <p className="text-on-surface-variant leading-relaxed text-sm">{u.content}</p>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
              
              <TabsContent value="contributors" className="mt-0">
                <div className="flex justify-between items-center mb-8">
                  <h3 className="font-serif font-bold text-2xl">Key Personnel</h3>
                  <AddContributorDialog templeId={temple.id} />
                </div>
                
                {temple.contributors.length === 0 ? (
                  <p className="text-on-surface-variant">No contributors listed.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {temple.contributors.map(c => (
                      <div key={c.id} className="bg-surface-container-lowest p-6 rounded-xl border border-outline-variant/10 shadow-sm flex items-center gap-4">
                        <AvatarRing initials={c.name.charAt(0)} size="lg" />
                        <div>
                          <p className="font-bold text-on-surface">{c.name}</p>
                          <p className="text-xs text-primary font-bold uppercase tracking-wider mt-1">{c.role}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
            </div>
          </Tabs>
        </div>

      </div>
    </Layout>
  );
}


// DIALOG COMPONENTS 

function AddMilestoneDialog({ templeId }: { templeId: number }) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const mutation = useCreateMilestone({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetTempleQueryKey(templeId) });
        toast({ title: "Milestone Added" });
        setOpen(false);
      }
    }
  });

  const form = useForm<z.infer<typeof milestoneFormSchema>>({
    resolver: zodResolver(milestoneFormSchema),
    defaultValues: { title: "", description: "", status: "pending", targetDate: "" }
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="flex items-center gap-1 text-sm font-bold text-primary hover:bg-primary/5 px-3 py-1.5 rounded-lg transition-colors">
          <Plus className="w-4 h-4" /> Add
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] border-0 shadow-2xl rounded-3xl bg-surface">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl text-on-surface">New Milestone</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(data => mutation.mutate({ id: templeId, data }))} className="space-y-4">
            <FormField control={form.control} name="title" render={({ field }) => (
              <FormItem><FormLabel>Title</FormLabel><FormControl><Input {...field} className="bg-surface-container-lowest border-outline-variant/30" /></FormControl></FormItem>
            )} />
            <FormField control={form.control} name="description" render={({ field }) => (
              <FormItem><FormLabel>Description</FormLabel><FormControl><Textarea {...field} className="bg-surface-container-lowest border-outline-variant/30" /></FormControl></FormItem>
            )} />
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="status" render={({ field }) => (
                <FormItem><FormLabel>Status</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl><SelectTrigger className="bg-surface-container-lowest border-outline-variant/30"><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      {Object.values(CreateMilestoneInputStatus).map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </FormItem>
              )} />
              <FormField control={form.control} name="targetDate" render={({ field }) => (
                <FormItem><FormLabel>Target Date</FormLabel><FormControl><Input type="date" {...field} className="bg-surface-container-lowest border-outline-variant/30" /></FormControl></FormItem>
              )} />
            </div>
            <button type="submit" disabled={mutation.isPending} className="w-full bg-primary text-on-primary py-3 rounded-xl font-bold mt-4">
              Save Milestone
            </button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function AddUpdateDialog({ templeId }: { templeId: number }) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const mutation = useCreateUpdate({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetTempleQueryKey(templeId) });
        toast({ title: "Update Posted" });
        setOpen(false);
      }
    }
  });

  const form = useForm<z.infer<typeof updateFormSchema>>({
    resolver: zodResolver(updateFormSchema),
    defaultValues: { title: "", content: "", author: "A. Sharma", category: "general" }
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="flex items-center gap-1 bg-primary text-on-primary px-4 py-2 rounded-lg font-bold text-sm">
          <Plus className="w-4 h-4" /> Post Update
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] border-0 shadow-2xl rounded-3xl bg-surface">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl text-on-surface">New Report</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(data => mutation.mutate({ id: templeId, data }))} className="space-y-4">
            <FormField control={form.control} name="title" render={({ field }) => (
              <FormItem><FormLabel>Title</FormLabel><FormControl><Input {...field} className="bg-surface-container-lowest border-outline-variant/30" /></FormControl></FormItem>
            )} />
            <FormField control={form.control} name="category" render={({ field }) => (
              <FormItem><FormLabel>Category</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl><SelectTrigger className="bg-surface-container-lowest border-outline-variant/30"><SelectValue /></SelectTrigger></FormControl>
                  <SelectContent>
                    {Object.values(CreateUpdateInputCategory).map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FormItem>
            )} />
            <FormField control={form.control} name="content" render={({ field }) => (
              <FormItem><FormLabel>Content</FormLabel><FormControl><Textarea rows={4} {...field} className="bg-surface-container-lowest border-outline-variant/30" /></FormControl></FormItem>
            )} />
            <button type="submit" disabled={mutation.isPending} className="w-full bg-primary text-on-primary py-3 rounded-xl font-bold mt-4">
              Post Update
            </button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function AddContributorDialog({ templeId }: { templeId: number }) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const mutation = useAddContributor({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetTempleQueryKey(templeId) });
        toast({ title: "Contributor Added" });
        setOpen(false);
      }
    }
  });

  const form = useForm<z.infer<typeof contributorFormSchema>>({
    resolver: zodResolver(contributorFormSchema),
    defaultValues: { name: "", role: "", contribution: "" }
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="flex items-center gap-1 bg-primary text-on-primary px-4 py-2 rounded-lg font-bold text-sm">
          <Plus className="w-4 h-4" /> Add Person
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] border-0 shadow-2xl rounded-3xl bg-surface">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl text-on-surface">Add Contributor</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(data => mutation.mutate({ id: templeId, data }))} className="space-y-4">
            <FormField control={form.control} name="name" render={({ field }) => (
              <FormItem><FormLabel>Name</FormLabel><FormControl><Input {...field} className="bg-surface-container-lowest border-outline-variant/30" /></FormControl></FormItem>
            )} />
            <FormField control={form.control} name="role" render={({ field }) => (
              <FormItem><FormLabel>Role</FormLabel><FormControl><Input {...field} className="bg-surface-container-lowest border-outline-variant/30" /></FormControl></FormItem>
            )} />
            <FormField control={form.control} name="contribution" render={({ field }) => (
              <FormItem><FormLabel>Contribution</FormLabel><FormControl><Textarea {...field} className="bg-surface-container-lowest border-outline-variant/30" /></FormControl></FormItem>
            )} />
            <button type="submit" disabled={mutation.isPending} className="w-full bg-primary text-on-primary py-3 rounded-xl font-bold mt-4">
              Add
            </button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
