# GraphQL Queries Reference

## Fetch All Review Threads

The REST API does NOT expose `isResolved` or `isOutdated`. Must use GraphQL.

```graphql
query($owner: String!, $repo: String!, $pr: Int!, $cursor: String) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $pr) {
      title
      baseRefOid
      headRefOid
      reviewThreads(first: 100, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          isResolved
          isOutdated
          isCollapsed
          line
          originalLine
          path
          resolvedBy { login }
          comments(first: 50) {
            nodes {
              id
              body
              author { login }
              outdated
              path
              line
              originalLine
              diffHunk
              createdAt
              commit { oid }
              originalCommit { oid }
            }
          }
        }
      }
    }
  }
}
```

Key fields:
- `isResolved` -- Thread explicitly resolved by a user
- `isOutdated` -- GitHub detected code changed at commented location
- `originalCommit.oid` -- Commit SHA when comment was created (use for git diff)
- `commit.oid` -- Current commit where line lives now

## Resolve a Thread

```graphql
mutation($threadId: ID!) {
  resolveReviewThread(input: { threadId: $threadId }) {
    thread { id isResolved }
  }
}
```

Use with `gh api graphql -f query='...' -f threadId=PRRT_xxx`.

## Thread Status Logic

| isResolved | isOutdated | Interpretation |
|------------|-----------|----------------|
| true | any | Explicitly resolved -- addressed |
| false | true | Code changed since comment -- likely addressed |
| false | false | Unchanged and unresolved -- needs attention |

For `isOutdated=false` + `isResolved=false`, run `git diff {original_commit} HEAD -- {path}` to double-check if the specific lines were modified (GitHub's outdated detection can miss some cases).

## Pagination

Review threads use cursor-based pagination. If `pageInfo.hasNextPage` is true, pass `endCursor` as the `$cursor` variable in the next request. The script handles this automatically.

## Rate Limits

GraphQL API has a point-based rate limit (5000 points/hour). The review threads query costs ~1 point per node. For PRs with <100 threads, a single request suffices.
