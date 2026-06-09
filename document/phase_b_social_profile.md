# Phase B: Social Linking & Profiles Documentation

## Overview
This document summarizes the changes introduced to establish the "Social" foundation of M.A.D. This involves user profiles, secure connections (friends), and a notification engine. 

## Features Implemented

### 1. Profile & Settings
- **UI:** A sleek overlay accessible via the top-right menu.
- **Profile Picture (Avatar):** Users can upload a custom profile picture. The image is resized client-side using an HTML5 Canvas to a maximum width of 250px and sent as a compressed JPEG Base64 string to the backend. Images are saved to a local `uploads/` directory and served statically.
- **QR Code:** A scannable QR code generated client-side using `qrcode.min.js`. It renders the user's `@username`.
- **Edit Details:** Users can update their `Display Name` and `Email`.
- **Password Management:** Form to update passwords securely.
- **Backend:** 
  - `PUT /api/auth/me` to update user details.
  - `POST /api/auth/avatar` to securely receive, parse, and store the base64 image data to the disk.
  - `PUT /api/auth/password` to verify the current hash and generate a new bcrypt hash.

### 2. Connections (Friend System)
- **Database (`connections` table):**
  - Stores a bi-directional graph using `requesterId`, `addresseeId`, and `status` (`pending`, `accepted`, `rejected`).
- **Backend (`routes/connections.js`):**
  - `POST /request`: Uses email or username to find the addressee and insert a `pending` row.
  - `GET /pending`: Fetches all incoming requests for the logged-in user.
  - `POST /accept/:id`: Updates connection status to `accepted` and triggers bidirectional notifications.
- **UI:**
  - "Send Friend Request" form directly in the Profile overlay.

### 3. Notification Engine
- **Database (`notifications` table):**
  - Simple log of `userId`, `message`, `isRead`, and `createdAt`.
- **Backend (`routes/notifications.js`):**
  - `GET /`: Retrieves unread notifications.
  - `POST /read`: Marks all retrieved notifications as read.
  - Internal integrations: Connections API automatically inserts notification rows when requests are sent or accepted.
- **UI:**
  - A notification bell in the main topbar.
  - A red badge dynamically updates using a 30-second polling interval in `app.js`.
  - Dropdown menu lists standard notifications and interactive "Pending Requests" with "Accept" buttons.

## Architecture Notes
- The email/notification system is currently using "dummy" behavior, logging directly to the internal database (`notifications` table) rather than integrating with an SMTP gateway (like SendGrid/AWS SES). This is adequate for local testing and pre-launch environments.
- Scanning QR codes via camera has been explicitly deferred. The QR code is currently intended for visual verification and external sharing.

## Next Steps
With profiles and connections established, the application is ready for Phase C: **Advanced Split Logic**, which will allow users to select their confirmed "friends" from their connections list when splitting a transaction.
