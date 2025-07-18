import React from 'react';
import { render, screen } from '@testing-library/react';
import SessionHero from './SessionHero';

describe('SessionHero', () => {
  it('renders and matches snapshot when visible', () => {
    const { asFragment } = render(<SessionHero isVisible={true} />);
    expect(asFragment()).toMatchSnapshot();
  });

  it('renders and matches snapshot when not visible', () => {
    const { asFragment } = render(<SessionHero isVisible={false} />);
    expect(asFragment()).toMatchSnapshot();
  });

  it('renders all feature highlights', () => {
    render(<SessionHero isVisible={true} />);
    expect(screen.getByLabelText(/real-time sync/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/group chat/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/playlist sharing/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/no account needed/i)).toBeInTheDocument();
  });

  it('has accessible tooltips for all features', () => {
    render(<SessionHero isVisible={true} />);
    expect(screen.getByRole('tooltip', { name: /everyone hears the same thing/i })).toBeInTheDocument();
    expect(screen.getByRole('tooltip', { name: /chat live with everyone/i })).toBeInTheDocument();
    expect(screen.getByRole('tooltip', { name: /collaborate on the perfect queue/i })).toBeInTheDocument();
    expect(screen.getByRole('tooltip', { name: /jump in instantly/i })).toBeInTheDocument();
  });
}); 