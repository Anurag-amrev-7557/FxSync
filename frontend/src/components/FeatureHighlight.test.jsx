import React from 'react';
import { render, screen } from '@testing-library/react';
import FeatureHighlight from './FeatureHighlight';

describe('FeatureHighlight', () => {
  const icon = <svg data-testid="icon" />;
  const text = 'Test Feature';
  const tooltip = 'Test tooltip';
  const accent = 'from-blue-400/30 to-blue-200/10';

  it('renders and matches snapshot', () => {
    const { asFragment } = render(
      <FeatureHighlight icon={icon} text={text} tooltip={tooltip} accent={accent} />
    );
    expect(asFragment()).toMatchSnapshot();
  });

  it('renders icon, text, and tooltip', () => {
    render(<FeatureHighlight icon={icon} text={text} tooltip={tooltip} accent={accent} />);
    expect(screen.getByTestId('icon')).toBeInTheDocument();
    expect(screen.getByText(text)).toBeInTheDocument();
    expect(screen.getByRole('tooltip')).toHaveTextContent(tooltip);
  });

  it('is accessible as a button with aria-label and tooltip', () => {
    render(
      <FeatureHighlight icon={icon} text={text} tooltip={tooltip} accent={accent} ariaLabel="Custom label" />
    );
    const button = screen.getByRole('button', { name: /custom label/i });
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute('aria-describedby');
    const tooltipEl = screen.getByRole('tooltip');
    expect(tooltipEl).toHaveTextContent(tooltip);
  });
}); 