import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { CountBadge } from './count-badge';

describe('CountBadge', () => {
  it('рендерит число', () => {
    render(<CountBadge count={3} />);
    expect(screen.getByText('3')).toBeInTheDocument();
  });
  it('порог по умолчанию 9 → «9+»', () => {
    render(<CountBadge count={42} />);
    expect(screen.getByText('9+')).toBeInTheDocument();
  });
  it('кастомный max=99 → «99+»', () => {
    render(<CountBadge count={150} max={99} />);
    expect(screen.getByText('99+')).toBeInTheDocument();
  });
  it('null при count <= 0', () => {
    const { container } = render(<CountBadge count={0} />);
    expect(container).toBeEmptyDOMElement();
  });
  it('прокидывает aria-label', () => {
    render(<CountBadge count={2} aria-label="2 непрочитанных" />);
    expect(screen.getByLabelText('2 непрочитанных')).toBeInTheDocument();
  });
});
