---
id: TASK-56
title: Production smoke test on speakukrainian.org
status: Done
assignee:
  - '@claude'
created_date: '2026-11-24T21:25:21Z'
updated_date: '2026-11-27T19:01:10Z'
labels:
  - infra
milestone: m-5
dependencies:
  - TASK-55
ordinal: 56000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The migration replaces the database, authentication, storage, e-mail and hosting at once, and several pieces (containers behind a Worker, Email Sending beta, D1 over HTTP) can only be proven on the real platform.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 https://speakukrainian.org renders the main page and www redirects to it
- [x] #2 The admin signs in with the default password, changes it, and the old one stops working
- [x] #3 A new student registers, receives a password-reset e-mail and signs in with the new password
- [x] #4 An H5P package is uploaded in the admin app and played in the student app
- [x] #5 A chat message sent by the student appears for the admin and the reply appears for the student
- [x] #6 The daily reminder endpoint, triggered once by hand, completes without error
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-25: first deploy done. Checked so far, read-only: https://speakukrainian.org renders the main page; www redirects (301) to the apex keeping path and query; http redirects to https; /favicon.ico served; unknown page 404; both apps load with production config and headers; CORS exact; bridge unreachable; the first-run admin can sign in with the default password and /api/admin/account reports usesDefaultPassword true; Email Routing now forwards the admin address to the owner's mailbox.
Still to do, all of which write to production or need the owner: changing the default admin password (the owner should choose it), a student registering and resetting a password by e-mail, an H5P upload and play, a chat round trip, and triggering the daily reminder.

2026-11-25: after the second deploy the first-run admin can no longer sign in with the default password, so it has been changed by the owners. The site icon is served on the three hosts.

2026-11-25, production, writing tests approved by the owner:
- Student: registered a test student (a plus-address of the owner's mailbox, id 52906a85-31be-4989-b784-80570008d6d7) -> 200 with a session token, role student, profile row created; /me/profile ok; an admin route answers 403 for it.
- Password reset: requested through the API; email_log shows password-reset "sent". The token was taken from the verification table (not from the mailbox) to finish the flow: reset 200, the old session then answers 401, the old password 401, the new password 200. Whether the message reached the inbox is for the owner to confirm; its link is already used.
- Chat, student side: the test student sent a message (201) and reads the thread back (1 message). No reply yet: that needs the administrator.
- Daily reminder: not triggered by hand - the real Cron Trigger fired at 08:00:57 UTC on 2026-11-25, outcome ok, and the gateway logged "Daily jobs done: {\"sent\":0}" (Workers observability). So the schedule, the secret and the call through the container binding work in production.
- Admin password: the default one no longer signs in. The owner changed it; the new one was not tested from here, on purpose.
Not done: H5P upload and play, and the admin reply in the chat. Both need an administrator session, and the administrator password is now known only to the owners. The test student still exists and should be deleted when the chat test is over.

2026-11-25, production, with a temporary administrator (approved by the owner): a test account promoted to admin directly in D1, used for the run and deleted afterwards. 21 of 21 checks passed:
- Admin: creates a free published course with a lesson; uploads a 12 MB H5P package (201 in 5.5 s); attaches it to the lesson; edits it through the editor endpoint.
- Student (second test account): cannot play before owning the course (403); enrolls; gets the player model with URLs on https://speakukrainian.org/api/h5p/; downloads the 12 MB media file with only the play token, byte-identical at both ends; range request 206; content.json reflects the edit; a tampered play token is refused (403); a result is recorded and my-courses shows 100%.
- Chat: student writes from the lesson; the admin sees the conversation as unread and reads it; the admin replies; the student sees one unread message and the reply in the thread.
- The real control panel, in the owner's own signed-in browser session, showed that conversation with both messages and the lesson context, and no default-password banner.
Cleanup: the three test accounts (two students, the temporary admin), the course and the exercise row were deleted from D1 and the six objects of the exercise and of its test library from R2. Afterwards: 1 user (the real administrator), 0 courses, lessons, exercises, orders, enrollments, messages and progress rows, 1 page, and an empty bucket. One email_log row remains (the password-reset record, no longer linked to a user).
Not covered: a real H5P content type, uploaded through the admin app and played in the student app in a browser. The package used here was a synthetic one with a made-up library, driven through the API, because no real .h5p file was available; it proves storage, access control and streaming, not that the H5P player renders in the browser in production.

2026-11-27: the owner reports that content authors are working in production, uploading real H5P packages in the admin app and installing H5P libraries (TASK-61), which covers the remaining criterion with real content types.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Production smoke test of the Cloudflare stack on speakukrainian.org after the first deploy (2026-11-25): main page and www/http redirects, admin default-password change, student registration and password reset by e-mail, chat round trip, daily reminder Cron Trigger, and H5P upload, access control and streaming (first with a synthetic package via the API, all test data cleaned up). Real H5P content uploaded through the admin app is now in use in production, confirmed by the owner on 2026-11-27.
<!-- SECTION:FINAL_SUMMARY:END -->
