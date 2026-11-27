-- The course summary is rich text now: sanitized HTML written in the control
-- panel's editor (see apps/api/src/courses/rich-text.ts). Summaries typed
-- before that are plain text; escape them and wrap them in a paragraph so they
-- read the same when shown as HTML. Line breaks become <br>. Every summary
-- stored when this runs was typed into a plain text box, so all of them are
-- converted.
update courses
set summary = '<p>' || replace(
      replace(replace(replace(replace(replace(trim(summary), char(13), ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;'),
        '"', '&quot;'),
      char(10), '<br>') || '</p>'
where trim(summary) <> '';
