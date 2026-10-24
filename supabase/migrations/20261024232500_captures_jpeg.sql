-- Full-page screenshots are stored as JPEG to keep uploads small.
update storage.buckets
set allowed_mime_types = array['image/png', 'image/jpeg', 'text/html']
where id = 'captures';
