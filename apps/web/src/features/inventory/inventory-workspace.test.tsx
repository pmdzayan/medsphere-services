import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { previewInventoryDataset } from './inventory-data';
import { InventoryWorkspace } from './inventory-workspace';

afterEach(() => cleanup());

describe('InventoryWorkspace preview boundary', () => {
  it('labels preview data and renders metrics derived from the displayed samples', () => {
    render(<InventoryWorkspace dataset={previewInventoryDataset} />);

    expect(screen.getByText('Sanitised preview')).toBeVisible();
    expect(screen.getAllByText(/Interface-validation data only/).length).toBeGreaterThan(0);
    expect(screen.getByText('Sample inventory value')).toBeVisible();
    expect(screen.getByText('Sample products')).toBeVisible();
    expect(screen.getByText('926 available units shown')).toBeVisible();
    expect(screen.getByRole('tab', { name: /Low stock 2/ })).toBeVisible();
    expect(screen.getByRole('tab', { name: /Expiring soon 2/ })).toBeVisible();
  });

  it('filters only the supplied dataset', () => {
    render(<InventoryWorkspace dataset={previewInventoryDataset} />);

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search medicine inventory' }), {
      target: { value: 'metformin' },
    });

    expect(screen.getByText('Metformin 500 mg')).toBeVisible();
    expect(screen.queryByText('Azithromycin 500 mg')).not.toBeInTheDocument();
    expect(screen.getByText('1', { selector: 'strong' })).toBeVisible();
  });

  it('keeps every unsupported operational control disabled', () => {
    render(<InventoryWorkspace dataset={previewInventoryDataset} />);

    expect(screen.getByRole('button', { name: 'Import stock' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Receive stock' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Scan barcode' })).toBeDisabled();
    for (const action of screen.getAllByRole('button', { name: /^Actions for/ })) {
      expect(action).toBeDisabled();
    }
  });
});
