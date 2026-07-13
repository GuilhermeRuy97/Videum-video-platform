import { SetMetadata } from '@nestjs/common';

export const IS_OPTIONAL_AUTH_KEY = 'isOptionalAuth';

/**
 * Marks a route as optionally authenticated: the global `JwtAuthGuard` attaches
 * `request.user` when a valid bearer token is present, but — unlike a fully
 * protected route — never rejects an anonymous or invalid-token request. Handlers
 * then branch on the presence of the user (e.g. owner-only visibility of a
 * non-`ready` video). The guard stays global; this is the opt-in for public
 * endpoints that still want to know the caller when they are logged in.
 */
export const OptionalAuth = () => SetMetadata(IS_OPTIONAL_AUTH_KEY, true);
