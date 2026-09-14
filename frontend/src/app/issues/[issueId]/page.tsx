'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Issue } from '@/types';
import { issueAPI } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { IssueDetailPage } from '@/components/IssueDetailPage';

export default function IssuePage() {
  const params = useParams();
  const router = useRouter();
  const { token } = useAuth();
  const rawIssueId = Array.isArray(params?.issueId) ? params.issueId[0] : params?.issueId;
  const issueId = Number.parseInt(rawIssueId || '0', 10);

  const [issue, setIssue] = useState<Issue | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) {
      router.push('/login');
      return;
    }
    if (Number.isNaN(issueId) || issueId <= 0) {
      setError('Invalid issue id');
      setIsLoading(false);
      return;
    }
    void fetchIssue();
  }, [issueId, token, router]);

  const fetchIssue = async () => {
    setIsLoading(true);
    setError('');
    try {
      const response = await issueAPI.getById(issueId);
      setIssue(response.data as Issue);
    } catch (fetchError: any) {
      console.error('Failed to fetch issue:', fetchError);
      setError(fetchError?.response?.data?.detail || 'Issue not found');
      setIssue(null);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="rounded border border-slate-200 bg-white/85 px-6 py-16 text-center text-sm text-slate-500 shadow-[0_22px_55px_rgba(15,23,42,0.08)]">
        Loading issue...
      </div>
    );
  }

  if (!issue) {
    return (
      <div className="rounded border border-rose-200 bg-rose-50 px-6 py-16 text-center text-sm font-medium text-rose-700">
        {error || 'Issue not found'}
      </div>
    );
  }

  return <IssueDetailPage initialIssue={issue} onIssueUpdated={setIssue} />;
}
