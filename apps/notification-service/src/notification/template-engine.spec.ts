import { TemplateEngine } from './template-engine';

describe('TemplateEngine', () => {
  let engine: TemplateEngine;

  beforeEach(() => {
    engine = new TemplateEngine();
  });

  describe('render', () => {
    it('should replace simple placeholders', () => {
      const result = engine.render('Hello {{name}}, your code is {{code}}.', null, {
        name: 'John',
        code: 'ABC123',
      });
      expect(result.body).toBe('Hello John, your code is ABC123.');
    });

    it('should render subject when provided', () => {
      const result = engine.render('Body text', 'Hello {{name}}', { name: 'John' });
      expect(result.subject).toBe('Hello John');
      expect(result.body).toBe('Body text');
    });

    it('should return undefined subject when not provided', () => {
      const result = engine.render('Body text', null, {});
      expect(result.subject).toBeUndefined();
    });

    it('should support nested property access', () => {
      const result = engine.render('Hello {{patient.firstName}} {{patient.lastName}}', null, {
        patient: { firstName: 'John', lastName: 'Doe' },
      });
      expect(result.body).toBe('Hello John Doe');
    });

    it('should leave placeholders as-is when value is missing', () => {
      const result = engine.render('Hello {{name}}, your code is {{code}}.', null, {
        name: 'John',
      });
      expect(result.body).toBe('Hello John, your code is {{code}}.');
    });

    it('should only substitute allowed variables when whitelist is provided', () => {
      const result = engine.render(
        'Hello {{name}}, your code is {{code}}.',
        null,
        { name: 'John', code: 'ABC123' },
        ['name'],
      );
      expect(result.body).toBe('Hello John, your code is {{code}}.');
    });

    it('should handle empty template', () => {
      const result = engine.render('', null, {});
      expect(result.body).toBe('');
    });

    it('should handle template with no placeholders', () => {
      const result = engine.render('Static text', null, { name: 'John' });
      expect(result.body).toBe('Static text');
    });

    it('should handle null values in payload', () => {
      const result = engine.render('Hello {{name}}', null, { name: null });
      expect(result.body).toBe('Hello {{name}}');
    });

    it('should convert non-string values to string', () => {
      const result = engine.render('Count: {{count}}', null, { count: 42 });
      expect(result.body).toBe('Count: 42');
    });
  });
});
