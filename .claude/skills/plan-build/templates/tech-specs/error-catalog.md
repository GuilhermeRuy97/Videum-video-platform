# Tech Spec subsection — Error Catalog

Applies when there are domain-specific error scenarios. **Convention:** the first HTTP-exposing phase in a subproject also defines the error response shape (established at first appearance, inherited by subsequent phases via `## Inherited Conventions` in context.md).

````markdown
### Error Catalog

| errorCode | HTTP | Trigger |
|-----------|------|---------|
| EMAIL_ALREADY_EXISTS | 409 | Signup with email already in use |
| INVALID_CREDENTIALS | 401 | Login with incorrect password |
````
