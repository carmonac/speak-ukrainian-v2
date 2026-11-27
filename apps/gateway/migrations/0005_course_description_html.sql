-- The course description is rich text now, like the summary (0004): sanitized
-- HTML written in the control panel's editor (see
-- apps/api/src/courses/rich-text.ts). Descriptions typed before that are plain
-- text; escape them and wrap them in a paragraph so they read the same when
-- shown as HTML. Line breaks become <br>. Every description stored when this
-- runs was typed into a plain text box, so all of them are converted.
update courses
set description = '<p>' || replace(
      replace(replace(replace(replace(replace(trim(description), char(13), ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;'),
        '"', '&quot;'),
      char(10), '<br>') || '</p>'
where trim(description) <> '';
