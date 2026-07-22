import { Injectable, Logger } from '@nestjs/common';

/**
 * Result of rendering a template.
 */
export interface TemplateRenderResult {
  subject?: string;
  body: string;
}

/**
 * Dynamic template engine that replaces `{{placeholders}}` with values
 * from a provided payload object.
 *
 * Supports nested property access via dot notation (e.g., `{{patient.firstName}}`).
 *
 * Security: Only keys listed in the template's `variables` array are substituted.
 * Unknown placeholders are left as-is for visibility.
 */
@Injectable()
export class TemplateEngine {
  private readonly logger = new Logger(TemplateEngine.name);

  /**
   * Render a template body (and optional subject) by replacing `{{key}}`
   * placeholders with values from the payload.
   *
   * @param body The template body containing `{{placeholders}}`
   * @param subject Optional template subject containing `{{placeholders}}`
   * @param payload The data to substitute into the template
   * @param allowedVariables Optional list of allowed variable keys. If provided,
   *   only these keys will be substituted; others are left as-is.
   */
  render(
    body: string,
    subject: string | null | undefined,
    payload: Record<string, unknown>,
    allowedVariables?: string[],
  ): TemplateRenderResult {
    const renderedBody = this.substitute(body, payload, allowedVariables);
    const renderedSubject = subject
      ? this.substitute(subject, payload, allowedVariables)
      : undefined;

    return {
      body: renderedBody,
      subject: renderedSubject,
    };
  }

  /**
   * Substitute `{{placeholders}}` in a template string with values from the payload.
   */
  private substitute(
    template: string,
    payload: Record<string, unknown>,
    allowedVariables?: string[],
  ): string {
    return template.replace(/\{\{([^}]+)\}\}/g, (match, keyPath: string) => {
      const trimmedKey = keyPath.trim();

      // Check if this variable is in the allowed list (if provided)
      if (allowedVariables && !allowedVariables.includes(trimmedKey)) {
        this.logger.warn(
          `Template variable "${trimmedKey}" is not in the allowed variables list; leaving as-is`,
        );
        return match;
      }

      const value = this.getNestedValue(payload, trimmedKey);

      if (value === undefined || value === null) {
        this.logger.warn(`Template variable "${trimmedKey}" not found in payload; leaving as-is`);
        return match;
      }

      return String(value);
    });
  }

  /**
   * Get a nested value from an object using dot notation.
   * e.g., getNestedValue({ patient: { name: 'John' } }, 'patient.name') => 'John'
   */
  private getNestedValue(obj: Record<string, unknown>, keyPath: string): unknown {
    return keyPath.split('.').reduce<unknown>((current, key) => {
      if (current && typeof current === 'object' && key in current) {
        return (current as Record<string, unknown>)[key];
      }
      return undefined;
    }, obj);
  }
}
