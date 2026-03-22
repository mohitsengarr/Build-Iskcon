import { Layout } from "@/components/layout/Layout";
import { useCreateTemple, CreateTempleInputStatus, getListTemplesQueryKey } from "@workspace/api-client-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { templeFormSchema } from "@/lib/schemas";
import { z } from "zod";
import { useLocation } from "wouter";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Save } from "lucide-react";
import { Link } from "wouter";

type FormValues = z.infer<typeof templeFormSchema>;

export default function TempleCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const createMutation = useCreateTemple({
    mutation: {
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: getListTemplesQueryKey() });
        toast({
          title: "Temple Created",
          description: "The sacred project has been successfully initiated.",
        });
        setLocation(`/temples/${data.id}`);
      },
      onError: (err) => {
        toast({
          title: "Error",
          description: "Failed to create temple. Please check your inputs.",
          variant: "destructive",
        });
      }
    }
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(templeFormSchema),
    defaultValues: {
      name: "",
      location: "",
      deity: "",
      description: "",
      status: "planning",
      phase: "Initial Design",
      constructionProgress: 0,
      fundraisingGoal: 10000000,
      fundraisingRaised: 0,
      startDate: new Date().toISOString().split('T')[0],
      expectedCompletion: new Date(new Date().setFullYear(new Date().getFullYear() + 2)).toISOString().split('T')[0],
      projectLead: "",
      coverImage: ""
    }
  });

  function onSubmit(data: FormValues) {
    createMutation.mutate({ data });
  }

  return (
    <Layout>
      <div className="max-w-4xl mx-auto pb-12">
        <div className="mb-8">
          <Link href="/temples" className="inline-flex items-center text-primary font-medium hover:underline mb-4">
            <ArrowLeft className="w-4 h-4 mr-1" /> Back to Projects
          </Link>
          <h1 className="text-4xl font-serif font-bold text-foreground">Initiate Project</h1>
          <p className="text-muted-foreground mt-2">Enter the details to start tracking a new temple construction.</p>
        </div>

        <div className="bg-card rounded-3xl p-8 shadow-md">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField control={form.control} name="name" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Temple Name</FormLabel>
                    <FormControl><Input placeholder="Shri Ram Mandir..." {...field} className="bg-background rounded-xl border-0 ring-1 ring-border shadow-sm focus-visible:ring-primary h-12" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="deity" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Primary Deity</FormLabel>
                    <FormControl><Input placeholder="Lord Shiva..." {...field} className="bg-background rounded-xl border-0 ring-1 ring-border shadow-sm focus-visible:ring-primary h-12" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="location" render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>Location</FormLabel>
                    <FormControl><Input placeholder="City, State, Country" {...field} className="bg-background rounded-xl border-0 ring-1 ring-border shadow-sm focus-visible:ring-primary h-12" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="description" render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>Description & Vision</FormLabel>
                    <FormControl><Textarea placeholder="Detail the architectural vision and spiritual significance..." {...field} className="bg-background rounded-xl border-0 ring-1 ring-border shadow-sm focus-visible:ring-primary min-h-[120px]" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <div className="h-px w-full bg-border/60 my-8" />

              <h3 className="text-xl font-serif font-bold text-foreground mb-4">Tracking Details</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField control={form.control} name="status" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Current Status</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger className="bg-background rounded-xl border-0 ring-1 ring-border shadow-sm focus:ring-primary h-12">
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {Object.values(CreateTempleInputStatus).map(s => (
                          <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="phase" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Specific Phase</FormLabel>
                    <FormControl><Input placeholder="e.g. Foundation Laying" {...field} className="bg-background rounded-xl border-0 ring-1 ring-border shadow-sm focus-visible:ring-primary h-12" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="startDate" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start Date</FormLabel>
                    <FormControl><Input type="date" {...field} className="bg-background rounded-xl border-0 ring-1 ring-border shadow-sm focus-visible:ring-primary h-12" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="expectedCompletion" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Expected Completion</FormLabel>
                    <FormControl><Input type="date" {...field} className="bg-background rounded-xl border-0 ring-1 ring-border shadow-sm focus-visible:ring-primary h-12" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="fundraisingGoal" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fundraising Goal (₹)</FormLabel>
                    <FormControl><Input type="number" {...field} className="bg-background rounded-xl border-0 ring-1 ring-border shadow-sm focus-visible:ring-primary h-12" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="projectLead" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Project Lead</FormLabel>
                    <FormControl><Input placeholder="Name of primary coordinator" {...field} className="bg-background rounded-xl border-0 ring-1 ring-border shadow-sm focus-visible:ring-primary h-12" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                
                <FormField control={form.control} name="coverImage" render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>Cover Image URL (Optional)</FormLabel>
                    <FormControl><Input placeholder="https://..." {...field} className="bg-background rounded-xl border-0 ring-1 ring-border shadow-sm focus-visible:ring-primary h-12" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <div className="flex justify-end pt-6">
                <button 
                  type="submit" 
                  disabled={createMutation.isPending}
                  className="flex items-center gap-2 bg-saffron-gradient text-white px-8 py-3.5 rounded-xl font-bold shadow-lg shadow-primary/25 hover:shadow-xl hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:transform-none"
                >
                  <Save className="w-5 h-5" />
                  {createMutation.isPending ? "Creating..." : "Initiate Project"}
                </button>
              </div>

            </form>
          </Form>
        </div>
      </div>
    </Layout>
  );
}
