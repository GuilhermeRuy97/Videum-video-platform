# StreamTube — General Project Plan

## 1. Overview

StreamTube is a video sharing platform where registered users can upload, manage, and publish videos. Anonymous users can watch freely, while social features such as comments, subscriptions, and likes are exclusive to authenticated users.

### Main Features

- **Anonymous access:** anyone can watch videos without registration.
- **Signup with confirmation:** registration via email with mandatory confirmation. The email prefix becomes the channel name.
- **Robust upload:** support for files up to 10GB without impacting system performance.
- **Video management:** drafts, information editing, public/unlisted visibility, custom thumbnails.
- **Social interactions:** likes/dislikes, comments with replies, channel subscriptions.
- **Channels:** each user has a channel with a public page and an admin panel.
- **Password recovery:** complete reset flow via email.
- **Suggestions:** related videos by category displayed in the sidebar.

### Technology Stack

- **Frontend:** Next.js
- **Backend:** Nest.js
- **Database:** PostgreSQL

---

## 2. Software Architecture

See the project architecture diagram: [software-arch.mermaid](diagrams/software-arch.mermaid)

---

## 3. Project Phases

### Phase 01 — Project Base Configuration

Preparation of the entire project foundation: repository, development environment, Next.js and Nest.js projects, PostgreSQL database, and auxiliary services.

- Repository with monorepo structure (frontend and backend)
- Next.js (frontend) project (will be created later, not now) and Nest.js (backend) initialized
- Local development environment with all services via Docker Compose
- Initial PostgreSQL database structure (schema, migrations, and seeds) (no tables yet)
- AI foundation for coding.

**Deliverables:** functional development environment, configured database.

---

### Phase 02 — Signup, Login and Account Management

> Depends on: Phase 01

Complete flow of account creation, email confirmation, login, logout, and password recovery.

- Transactional email sending service
- User signup with email and password
- Automatic creation of the user channel from the email prefix
- Account confirmation via email with activation link
- Login and user session control
- Logout
- Password recovery: request via email → link with token → reset
- Signup, login, account confirmation, and password recovery screens

**Deliverables:** complete signup → confirmation → login → password recovery flow working. Channel automatically created for each user.

---

### Phase 03 — Upload and Video Processing

> Depends on: Phase 01, Phase 02

Upload of large files without hanging the system, automatic video processing, and unique URL generation.

- File storage service (videos and thumbnails)
- Background processing service (queues)
- Video upload supporting files up to 10GB without performance impact
- Automatic pre-registration of the video as a draft when upload starts
- Automatic video processing after upload (duration and metadata extraction)
- Automatic thumbnail generation from a video frame
- Unique URL per video, without conflict with other videos
- Streaming playback (no full download required)
- Video download by the user

**Deliverables:** functional upload up to 10GB, automatic video processing, working streaming, unique URLs generated.

---

### Phase 04 — Video and Channel Management

> Depends on: Phase 02, Phase 03

Editing video information, draft and publish flow, channel admin panel, and public page.

- Video categories available on the platform
- Video information editing: title, description, category, and custom thumbnail
- Video visibility: public (visible to everyone) or unlisted (only via link)
- Draft → publish flow
- Channel video management panel (thumbnail, title, views, likes, comments, publish time, and status)
- Video editing from the panel
- Channel information editing: nickname, name, and description
- Public channel page with information and video listing

**Deliverables:** complete video editing, draft/publish, management panel, channel editing, public channel page.

---

### Phase 05 — Video Viewing Page

> Depends on: Phase 03, Phase 04

Page where the user watches the video with a functional player, description, suggestions, and anonymous access.

- Video player with controls: play/pause, volume, and progress bar
- Page layout: main video + information + sidebar with suggestions
- Video description with expand/collapse
- View count
- Sidebar suggestions of videos in the same category
- Anonymous access to video viewing
- Video download button
- Unlisted videos accessible only via direct link (not appearing in listings)

**Deliverables:** viewing page with functional player, suggestions sidebar, download, and anonymous access.

---

### Phase 06 — Social Interactions (Likes, Comments, Subscriptions)

> Depends on: Phase 02, Phase 05

Likes/dislikes on videos and comments, comments with replies, and channel subscriptions.

- Like and dislike on videos (authenticated users)
- Comments on videos (authenticated users)
- Replies to comments (nested comments)
- Like and dislike on comments (authenticated users)
- Channel subscriptions (follow/unfollow)
- Followed channels area with quick access to videos
- Subscriber count on the channel page
- Complete comments, likes, and subscriptions interface

**Deliverables:** working likes/dislikes, comments with replies, channel subscriptions, followed channels listing.

---

### Phase 07 — Home Page, Search and Finalization

> Depends on: all previous phases

Home page with video listing, search, general navigation, responsiveness, and production preparation.

- Home page with video grid (thumbnail, title, channel, views, and publish time)
- Video filter by category on home
- Search bar (search by title and channel)
- Header/navbar with logo, search bar, login/avatar button, and navigation
- Pagination or infinite scroll in video listings
- Responsive layout for mobile devices
- Tests of the main platform flows
- Production environment and deployment

**Deliverables:** home page, search, navigation, responsiveness, tests performed, and configured production environment.

---

## 4. Points of Attention

- **Large file upload:** the upload of up to 10GB must be done in a way that does not hang the system and allows resuming in case of connection failure.
- **Video processing:** extracting video information is heavy and must happen in the background, without blocking the user.
- **Unique URLs:** each video needs a short, unique URL that never conflicts with another video.
- **Storage:** large videos consume a lot of space. It is important to plan storage growth and costs from the start.
- **Streaming:** the video must start playing without the user needing to download the entire file.
- **Nested comments:** define how many levels of replies will be allowed to keep the interface organized.
- **Anonymous like/dislike:** since any user can like/dislike, abuse must be prevented (e.g., multiple likes from the same user).