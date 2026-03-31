import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, AlertCircle, Search, RefreshCw, CreditCard, ShieldAlert, Store, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';

const severityStyles = {
  critical: 'bg-red-100 text-red-800 border-red-200',
  warning: 'bg-amber-100 text-amber-800 border-amber-200',
  info: 'bg-blue-100 text-blue-800 border-blue-200',
};

const issueStyles = {
  open: 'bg-red-100 text-red-800 border-red-200',
  reviewed: 'bg-amber-100 text-amber-800 border-amber-200',
  resolved: 'bg-green-100 text-green-800 border-green-200',
  escalated: 'bg-purple-100 text-purple-800 border-purple-200',
  closed: 'bg-slate-100 text-slate-800 border-slate-200',
};

function MetricCard({ title, value, icon: Icon, tone = 'text-slate-700' }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-3xl font-bold text-slate-900">{value}</p>
          </div>
          <div className="p-3 rounded-xl bg-slate-100">
            <Icon className={`h-6 w-6 ${tone}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function FailureRow({ failure, restaurantMap }) {
  const data = failure;
  return (
    <div className="rounded-xl border p-4 bg-white space-y-3">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={severityStyles[data.severity] || severityStyles.warning}>{data.severity || 'warning'}</Badge>
            <Badge variant="outline">{data.failure_type || 'failure'}</Badge>
            {data.compensation_status && <Badge variant="outline">{data.compensation_status}</Badge>}
          </div>
          <p className="font-semibold text-slate-900 break-words">{data.error_message || 'No message'}</p>
          <div className="text-sm text-slate-500 space-y-1">
            <p>Restaurant: {restaurantMap[data.restaurant_id] || data.restaurant_id || 'Unknown'}</p>
            <p>Payment Intent: {data.payment_intent_id || '—'}</p>
            <p>Order ID: {data.order_id || '—'}</p>
            <p>Customer: {data.customer_email || data.guest_email || data.user_email || '—'}</p>
            <p>Logged: {data.logged_at ? format(new Date(data.logged_at), 'dd MMM yyyy, h:mm a') : (failure.created_date ? format(new Date(failure.created_date), 'dd MMM yyyy, h:mm a') : '—')}</p>
          </div>
        </div>
        <div className="text-sm text-slate-500 whitespace-nowrap">
          {failure.created_date ? format(new Date(failure.created_date), 'dd MMM yyyy, h:mm a') : '—'}
        </div>
      </div>
    </div>
  );
}

function IssueRow({ issue, restaurantMap }) {
  const data = issue;
  return (
    <div className="rounded-xl border p-4 bg-white space-y-3">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={issueStyles[data.status] || issueStyles.open}>{data.status || 'open'}</Badge>
            <Badge className={severityStyles[data.severity] || severityStyles.warning}>{data.severity || 'warning'}</Badge>
            <Badge variant="outline">{data.issue_type || 'issue'}</Badge>
          </div>
          <p className="font-semibold text-slate-900 break-words">{data.suggested_action || data.metadata?.failure_reason || 'No summary available'}</p>
          <div className="text-sm text-slate-500 space-y-1">
            <p>Restaurant: {restaurantMap[data.restaurant_id] || data.restaurant_id || 'Unknown'}</p>
            <p>Payment Intent: {data.metadata?.payment_intent_id || '—'}</p>
            <p>Order ID: {data.order_id || '—'}</p>
            <p>Amount: {typeof data.amount === 'number' ? `£${data.amount.toFixed(2)}` : '—'}</p>
            <p>Detected: {data.detected_at ? format(new Date(data.detected_at), 'dd MMM yyyy, h:mm a') : '—'}</p>
          </div>
        </div>
        <div className="text-sm text-slate-500 whitespace-nowrap">
          {data.detected_at ? format(new Date(data.detected_at), 'dd MMM yyyy, h:mm a') : '—'}
        </div>
      </div>
    </div>
  );
}

export default function FailureMonitoringDashboard() {
  const [search, setSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [issueStatusFilter, setIssueStatusFilter] = useState('all');
  const [clearingLogs, setClearingLogs] = useState(false);

  const handleClearLogs = async () => {
    if (!window.confirm('Delete all failure logs and reconciliation issues? This cannot be undone.')) return;
    setClearingLogs(true);
    try {
      const response = await base44.functions.invoke('clearOldLogs', {});
      alert(`✅ Cleared: ${response.data.failureLogsDeleted} FailureLogs, ${response.data.reconciliationIssuesDeleted} ReconciliationIssues`);
      refetchFailures();
      refetchIssues();
    } catch (error) {
      alert('❌ Error: ' + error.message);
    } finally {
      setClearingLogs(false);
    }
  };

  const { data: failures = [], refetch: refetchFailures, isFetching: loadingFailures } = useQuery({
    queryKey: ['failure-logs-dashboard'],
    queryFn: () => base44.entities.FailureLog.list('-created_date', 200),
    refetchInterval: 30000,
  });

  const { data: issues = [], refetch: refetchIssues, isFetching: loadingIssues } = useQuery({
    queryKey: ['reconciliation-issues-dashboard'],
    queryFn: () => base44.entities.ReconciliationIssue.list('-created_date', 200),
    refetchInterval: 30000,
  });

  const { data: restaurants = [] } = useQuery({
    queryKey: ['restaurants-for-failure-dashboard'],
    queryFn: () => base44.entities.Restaurant.list(),
  });

  const restaurantMap = useMemo(
    () => Object.fromEntries(restaurants.map((r) => [r.id, r.name])),
    [restaurants]
  );

  const filteredFailures = useMemo(() => {
    const q = search.trim().toLowerCase();
    return failures.filter((failure) => {
      const data = failure;
      const matchesSeverity = severityFilter === 'all' || data.severity === severityFilter;
      const haystack = [
        data.error_message,
        data.failure_type,
        data.payment_intent_id,
        data.order_id,
        data.customer_email,
        data.guest_email,
        data.user_email,
        restaurantMap[data.restaurant_id],
      ].filter(Boolean).join(' ').toLowerCase();
      return matchesSeverity && (!q || haystack.includes(q));
    });
  }, [failures, search, severityFilter, restaurantMap]);

  const filteredIssues = useMemo(() => {
    const q = search.trim().toLowerCase();
    return issues.filter((issue) => {
      const data = issue;
      const matchesSeverity = severityFilter === 'all' || data.severity === severityFilter;
      const matchesStatus = issueStatusFilter === 'all' || data.status === issueStatusFilter;
      const haystack = [
        data.issue_type,
        data.order_id,
        data.metadata?.payment_intent_id,
        data.metadata?.customer_email,
        data.suggested_action,
        data.metadata?.failure_reason,
        restaurantMap[data.restaurant_id],
      ].filter(Boolean).join(' ').toLowerCase();
      return matchesSeverity && matchesStatus && (!q || haystack.includes(q));
    });
  }, [issues, search, severityFilter, issueStatusFilter, restaurantMap]);

  const criticalFailures = failures.filter((f) => f.severity === 'critical').length;
  const refundFailures = failures.filter((f) => String(f.failure_type || '').includes('refund')).length;
  const openIssues = issues.filter((i) => ['open', 'reviewed', 'escalated'].includes(i.status)).length;
  const escalatedIssues = issues.filter((i) => i.status === 'escalated' || i.requires_escalation).length;

  const refreshAll = () => {
    refetchFailures();
    refetchIssues();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
         <div>
           <h2 className="text-2xl font-bold text-slate-900">Failure Monitoring</h2>
           <p className="text-sm text-slate-500">Track critical failures, refund problems, and issues needing manual review.</p>
         </div>
         <div className="flex gap-2 w-full md:w-auto">
           <Button onClick={refreshAll} variant="outline" className="gap-2 flex-1 md:flex-initial">
             <RefreshCw className={`h-4 w-4 ${(loadingFailures || loadingIssues) ? 'animate-spin' : ''}`} />
             Refresh
           </Button>
           <Button onClick={handleClearLogs} disabled={clearingLogs} variant="destructive" className="gap-2 flex-1 md:flex-initial">
             <Trash2 className="h-4 w-4" />
             {clearingLogs ? 'Clearing...' : 'Clear Logs'}
           </Button>
         </div>
       </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <MetricCard title="Critical Failures" value={criticalFailures} icon={AlertTriangle} tone="text-red-600" />
        <MetricCard title="Refund Failures" value={refundFailures} icon={CreditCard} tone="text-amber-600" />
        <MetricCard title="Open Issues" value={openIssues} icon={ShieldAlert} tone="text-purple-600" />
        <MetricCard title="Escalations" value={escalatedIssues} icon={Store} tone="text-slate-700" />
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="relative md:col-span-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search payment intent, order, customer..." className="pl-10" />
            </div>
            <Select value={severityFilter} onValueChange={setSeverityFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Severity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Severities</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="warning">Warning</SelectItem>
                <SelectItem value="info">Info</SelectItem>
              </SelectContent>
            </Select>
            <Select value={issueStatusFilter} onValueChange={setIssueStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Issue status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Issue Statuses</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="reviewed">Reviewed</SelectItem>
                <SelectItem value="escalated">Escalated</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-red-500" />
              Recent Failure Logs ({filteredFailures.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 max-h-[900px] overflow-auto">
            {filteredFailures.length === 0 ? (
              <p className="text-sm text-slate-500">No matching failure logs.</p>
            ) : (
              filteredFailures.map((failure) => <FailureRow key={failure.id} failure={failure} restaurantMap={restaurantMap} />)
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-amber-500" />
              Reconciliation Issues ({filteredIssues.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 max-h-[900px] overflow-auto">
            {filteredIssues.length === 0 ? (
              <p className="text-sm text-slate-500">No matching reconciliation issues.</p>
            ) : (
              filteredIssues.map((issue) => <IssueRow key={issue.id} issue={issue} restaurantMap={restaurantMap} />)
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}