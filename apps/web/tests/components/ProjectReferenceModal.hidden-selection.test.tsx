// @vitest-environment jsdom

// Regression: Reference another project can confirm a hidden auto-selection.
//
// The dialog selects the first project on open. Search filters the rows on
// screen, but Confirm used to stay enabled and submit that hidden project.
// The submitted set is the selection intersected with the visible list.
// Filtering does not clear the selection, so clearing the query restores it.
// (Issue #7836.)

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Project } from '../../src/types';
import {
  ProjectReferenceModal,
  type ProjectReferenceSelection,
} from '../../src/components/ProjectReferenceModal';
import { I18nProvider } from '../../src/i18n';
import type { Locale } from '../../src/i18n/types';
import { getProjectDetail, listProjects } from '../../src/state/projects';

vi.mock('../../src/state/projects', () => ({
  getProjectDetail: vi.fn(),
  listProjects: vi.fn(),
}));

function project(id: string, name: string): Project {
  return {
    id,
    name,
    skillId: null,
    designSystemId: null,
    createdAt: 0,
    updatedAt: 0,
    metadata: { kind: 'prototype' },
  };
}

const alpha = project('alpha', 'Alpha Studio');
const beta = project('beta', 'Beta Lab');

type ProjectSelectHandler = (items: ProjectReferenceSelection[]) => void;

function renderModal() {
  const onSelect = vi.fn<ProjectSelectHandler>();
  render(
    <I18nProvider initial={'en' as Locale}>
      <ProjectReferenceModal onClose={vi.fn()} onSelect={onSelect} />
    </I18nProvider>,
  );
  return onSelect;
}

async function openDialog(): Promise<HTMLButtonElement> {
  await screen.findByRole('option', { name: /Alpha Studio/ });
  const confirm = screen.getByRole('button', { name: 'Reference project' });
  expect(confirm).toBeEnabled();
  return confirm as HTMLButtonElement;
}

function hideAutoSelection() {
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'beta' } });
  expect(screen.queryByRole('option', { name: /Alpha Studio/ })).toBeNull();
  expect(screen.getByRole('option', { name: /Beta Lab/ })).toBeTruthy();
}

beforeEach(() => {
  vi.mocked(listProjects).mockReset();
  vi.mocked(getProjectDetail).mockReset();
  vi.mocked(listProjects).mockResolvedValue([alpha, beta]);
  vi.mocked(getProjectDetail).mockImplementation(async (id: string) => ({
    project: id === alpha.id ? alpha : beta,
    resolvedDir: `/tmp/open-design/${id}`,
  }));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ProjectReferenceModal hidden selection', () => {
  it('disables Confirm when the auto-selected project is filtered out', async () => {
    renderModal();
    const confirm = await openDialog();

    hideAutoSelection();

    expect(confirm).toBeDisabled();
  });

  it('does not submit the hidden auto-selected project', async () => {
    const onSelect = renderModal();
    const confirm = await openDialog();
    hideAutoSelection();
    vi.mocked(getProjectDetail).mockClear();

    // confirm() reads project detail synchronously before its first await,
    // so a hidden submit shows up as a detail read for the unseen project.
    fireEvent.click(confirm);

    expect(vi.mocked(getProjectDetail).mock.calls.map((call) => call[0])).toEqual([]);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('submits only the visible selection and restores a hidden one when search clears', async () => {
    const onSelect = renderModal();
    const confirm = await openDialog();
    hideAutoSelection();

    fireEvent.click(screen.getByRole('option', { name: /Beta Lab/ }));
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);

    await waitFor(() => expect(onSelect).toHaveBeenCalledTimes(1));
    expect(onSelect.mock.calls[0]![0].map((item) => item.project.id)).toEqual(['beta']);

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '' } });

    expect(screen.getByRole('option', { name: /Alpha Studio/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('option', { name: /Beta Lab/ })).toHaveAttribute('aria-selected', 'true');
    expect(confirm).toBeEnabled();
  });
});
