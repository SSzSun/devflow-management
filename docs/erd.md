# Database ER diagram

Derived from `apps/api/prisma/schema.prisma`. Migrations live in
`apps/api/prisma/migrations`.

```mermaid
erDiagram
  User ||--o{ RefreshToken : "has"
  User ||--o{ Workspace : "owns"
  User ||--o{ WorkspaceMember : "joins"
  User ||--o{ ProjectMember : "joins"
  User ||--o{ Issue : "is assigned"
  User ||--o{ Issue : "created"
  User ||--o{ Comment : "writes"
  User ||--o{ ActivityLog : "acts in"

  Workspace ||--|{ WorkspaceMember : "has members"
  Workspace ||--o{ Project : "contains"

  Project ||--|{ ProjectMember : "has members"
  Project ||--o{ Label : "defines"
  Project ||--o{ Issue : "contains"
  Project ||--|| ProjectCounter : "numbers issues"

  Issue ||--o{ Comment : "has"
  Issue ||--o{ ActivityLog : "logs"
  Issue ||--o{ IssueLabel : "tagged"
  Label ||--o{ IssueLabel : "applied to"

  User {
    string id PK
    string email UK
    string passwordHash
    string name
    string avatarUrl
    datetime createdAt
    datetime updatedAt
  }

  RefreshToken {
    string id PK
    string tokenHash UK
    string userId FK
    datetime expiresAt
    datetime revokedAt
  }

  Workspace {
    string id PK
    string name
    string slug UK
    string ownerId FK
  }

  WorkspaceMember {
    string workspaceId PK, FK
    string userId PK, FK
    WorkspaceRole role "OWNER | ADMIN | MEMBER"
    datetime joinedAt
  }

  Project {
    string id PK
    string name
    string key "e.g. WEB, unique per workspace"
    string description
    string workspaceId FK
    datetime archivedAt "null = active"
  }

  ProjectMember {
    string projectId PK, FK
    string userId PK, FK
    ProjectRole role "ADMIN | MEMBER | VIEWER"
    datetime joinedAt
  }

  ProjectCounter {
    string projectId PK, FK
    int lastIssueNumber
  }

  Label {
    string id PK
    string projectId FK
    string name "unique per project"
    string color
  }

  Issue {
    string id PK
    int number "unique per project"
    string projectId FK
    string title
    string description
    IssueStatus status "TODO | IN_PROGRESS | IN_REVIEW | DONE"
    IssuePriority priority "LOW | MEDIUM | HIGH | URGENT"
    string assigneeId FK
    string createdById FK
    datetime dueDate
    datetime deletedAt "null = live (soft delete)"
  }

  IssueLabel {
    string issueId PK, FK
    string labelId PK, FK
  }

  Comment {
    string id PK
    string issueId FK
    string authorId FK
    string body
  }

  ActivityLog {
    string id PK
    string issueId FK
    string actorId FK
    string action "created | status_changed | ..."
    string fromValue
    string toValue
    datetime createdAt
  }
```

## Notes

- `WorkspaceMember` and `ProjectMember` use composite primary keys
  (`workspaceId, userId`) and (`projectId, userId`), so membership is unique by
  construction.
- `User` sits on both sides of `Issue` twice: `assigneeId` (`onDelete: SetNull`
  — deleting a user unassigns work) and `createdById` (`onDelete: Restrict` —
  authorship must not disappear).
- `Project.archivedAt` and `Issue.deletedAt` are the two "not really gone"
  markers described in [architecture.md](./architecture.md).
- Indexes exist for the query shapes actually used: issues by
  `(projectId, status)`, `(projectId, assigneeId)`, `(projectId, updatedAt)`;
  comments and activity by `(issueId, createdAt)`; `IssueLabel.labelId` for
  label filters.
