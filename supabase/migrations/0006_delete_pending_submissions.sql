-- The original schema deliberately gave brokers no delete policy on
-- submissions, to keep the admin review trail intact. But brokers can now
-- delete their own PENDING submissions from the dashboard (added so they can
-- clean up mistakes/duplicates before they're reviewed) — that server action
-- has been silently doing nothing until now, because RLS blocked the delete
-- with no error (0 rows affected, not a failure). Reviewed submissions
-- (approved/rejected) still can't be deleted, preserving the trail.
create policy "Brokers can delete their own pending submissions"
  on public.submissions for delete
  using (auth.uid() = broker_id and status = 'pending');

-- Same gap existed for the uploaded Excel/screenshot files themselves —
-- brokers could upload but never had a policy allowing them to remove their
-- own files from the broker-uploads bucket.
create policy "Brokers can delete their own uploaded files"
  on storage.objects for delete
  using (
    bucket_id = 'broker-uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
