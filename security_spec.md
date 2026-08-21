# Security Specification - Internal Chat System

## Data Invariants
1. **Participant Access Only**: Users can only read/write conversations and messages if they are listed in `participantIds`.
2. **"ALL_EMPLOYEES" Public Channel Exception**: Any registered employee can access and participate in a conversation of type `ALL_EMPLOYEES`.
3. **No Super Admin Exposure**: Any user with `SUPER_ADMIN` role or UID must be isolated. No conversation can include a Super Admin, and Super Admins cannot be searched or discovered.
4. **Valid Message Sender**: The `senderId` in any message must match the authenticated user's registered `employeeCode` or administrative `loginId`.
5. **Immutable Identity**: Messages cannot change sender, and conversations cannot have their type altered after creation.

## The "Dirty Dozen" Threat Payloads

### 1. The Direct Message Hijack
* **Payload**: `create` in `/chat_conversations/hacked_conv` where `participantIds` does not contain the creator's identity.
* **Goal**: Read/write in a room without being a participant.
* **Expected Outcome**: `PERMISSION_DENIED`

### 2. The Ghost Field Attack
* **Payload**: `create` with a custom unvalidated field `isSystemAdminPrivileged: true` on a message or conversation.
* **Goal**: Inject unauthorized fields to subvert system behavior.
* **Expected Outcome**: `PERMISSION_DENIED`

### 3. Identity Spoofing (Sender Impersonation)
* **Payload**: `create` a message with `senderId: "EXFRNG999"` when the user's real employee code is `"EXFRNG001"`.
* **Goal**: Send messages as another user.
* **Expected Outcome**: `PERMISSION_DENIED`

### 4. Direct Message Read Violation
* **Payload**: `read` `/chat_conversations/confidential_conv` where the current user is not in the `participantIds`.
* **Goal**: Intercept messages of other users' direct/group chats.
* **Expected Outcome**: `PERMISSION_DENIED`

### 5. Historical Message Mutation
* **Payload**: `update` a message's content or `senderId` in the past.
* **Goal**: Alter chat history.
* **Expected Outcome**: `PERMISSION_DENIED`

### 6. Super Admin Discovery Probe
* **Payload**: `read` / query `registrations` or `admin_users` searching for users with role `"SUPER_ADMIN"` or matching the Super Admin UID.
* **Goal**: Find and contact the Super Admin.
* **Expected Outcome**: Ignored / filtered out from client-side search and prohibited by security policies.

### 7. Message Deletion
* **Payload**: `delete` on a message in `chat_conversations/{id}/messages/{msgId}` by anyone other than Super Admin (or completely locked down).
* **Goal**: Erase evidence of correspondence.
* **Expected Outcome**: `PERMISSION_DENIED`

### 8. Conversation Escalation
* **Payload**: `update` a conversation to change `type` from `"DIRECT"` to `"ALL_EMPLOYEES"` without authority.
* **Goal**: Expose private direct message to all employees.
* **Expected Outcome**: `PERMISSION_DENIED`

### 9. System Timestamp Spoofing
* **Payload**: `create` message with custom client-side `timestamp` in the future.
* **Goal**: Force messages to pin at the top.
* **Expected Outcome**: Rejected unless `request.time` matches.

### 10. Large Payload Denial of Service
* **Payload**: Create a message with a `content` field exceeding 10,000 characters.
* **Goal**: Infinite UI wrapping or memory leaks in browsers.
* **Expected Outcome**: Prohibited by `.size()` rule checks.

### 11. Blank Message Bomb
* **Payload**: Send a message with `content: ""` (empty string).
* **Goal**: Create empty unreadable elements in databases.
* **Expected Outcome**: Rejected by `.size() >= 1` constraints.

### 12. Orphaned Message Insertion
* **Payload**: Send a message to a non-existent conversation ID.
* **Goal**: Create dangling message documents.
* **Expected Outcome**: Prohibited by existence check rules.
