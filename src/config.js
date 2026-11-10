// Build-time configuration.

/** The product name. One place only: change it here. */
export const APP_NAME = 'NOM';

/**
 * Where anonymous, opt-in feedback is POSTed. Set at build time with the FEEDBACK_URL environment variable.
 * Empty (the default) removes the feedback button altogether.
 * @type {string}
 */
export const FEEDBACK_URL = typeof __FEEDBACK_URL__ === 'string' ? __FEEDBACK_URL__ : '';
