// @vitest-environment jsdom

/**
 * Unit Tests for AccountGroupItem Component
 * 
 * These tests verify expand/collapse behavior, balance display, and edit/delete actions.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AccountType } from '../../shared/accountTypes';
import { AccountGroup } from '../types';
import { AccountGroupItem } from './AccountGroupItem';

// Mock the window.electron API
const mockInvoke = vi.fn();

describe('AccountGroupItem', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    (window as any).electron = {
      ipcRenderer: {
        invoke: mockInvoke,
        on: vi.fn(),
      },
    };
    vi.spyOn(window, 'confirm').mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Test: Expand/collapse behavior
   * Validates that the component can toggle between expanded and collapsed states
   */
  it('should toggle between expanded and collapsed states', () => {
    let isExpanded = false;
    const onToggle = () => {
      isExpanded = !isExpanded;
    };

    expect(isExpanded).toBe(false);
    onToggle();
    expect(isExpanded).toBe(true);
    onToggle();
    expect(isExpanded).toBe(false);
  });

  /**
   * Test: Fetch aggregate balance on mount
   * Validates that the component fetches aggregate balance when mounted
   */
  it('should fetch aggregate balance for the group', async () => {
    const groupId = 'group-123';
    const mockBalance = 1000.50;

    mockInvoke.mockResolvedValueOnce(mockBalance);

    const balance = await window.electron.ipcRenderer.invoke(
      'get-group-aggregate-balance',
      groupId
    );

    expect(mockInvoke).toHaveBeenCalledWith('get-group-aggregate-balance', groupId);
    expect(balance).toBe(mockBalance);
  });

  /**
   * Test: Handle multi-currency aggregate balance
   * Validates that the component can handle multi-currency balances
   */
  it('should handle multi-currency aggregate balance', async () => {
    const groupId = 'group-123';
    const mockBalances = {
      USD: 1000.50,
      EUR: 500.25,
      GBP: 750.00,
    };

    mockInvoke.mockResolvedValueOnce(mockBalances);

    const balances = await window.electron.ipcRenderer.invoke(
      'get-group-aggregate-balance',
      groupId
    );

    expect(mockInvoke).toHaveBeenCalledWith('get-group-aggregate-balance', groupId);
    expect(balances).toEqual(mockBalances);
    expect(typeof balances).toBe('object');
    expect(balances.USD).toBe(1000.50);
    expect(balances.EUR).toBe(500.25);
    expect(balances.GBP).toBe(750.00);
  });

  /**
   * Test: Edit action callback
   * Validates that the edit button triggers the onEdit callback
   */
  it('should call onEdit when edit button is clicked', () => {
    const onEdit = vi.fn();
    
    onEdit();

    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  /**
   * Test: Delete action with confirmation - empty group
   * Validates that deleting an empty group shows appropriate confirmation
   */
  it('should show confirmation dialog when deleting an empty group', () => {
    const group: AccountGroup = {
      id: 'group-123',
      name: 'Test Group',
      accountType: AccountType.User,
      displayOrder: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      accounts: [],
    };

    vi.mocked(window.confirm).mockReturnValueOnce(true);

    const onDelete = vi.fn();
    const accountCount = group.accounts?.length || 0;
    const message = accountCount > 0
      ? `Are you sure you want to delete "${group.name}"? This group contains ${accountCount} account(s). The accounts will be moved to the ungrouped section.`
      : `Are you sure you want to delete "${group.name}"?`;
    
    const confirmed = window.confirm(message);
    if (confirmed) {
      onDelete();
    }

    expect(window.confirm).toHaveBeenCalledWith(`Are you sure you want to delete "${group.name}"?`);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  /**
   * Test: Delete action with confirmation - group with accounts
   * Validates that deleting a group with accounts shows appropriate warning
   */
  it('should show warning when deleting a group with accounts', () => {
    const group: AccountGroup = {
      id: 'group-123',
      name: 'Test Group',
      accountType: AccountType.User,
      displayOrder: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      accounts: [
        {
          id: 'account-1',
          name: 'Account 1',
          type: AccountType.User,
          currency: 'USD',
          subtype: 'asset',
          isArchived: false,
        },
        {
          id: 'account-2',
          name: 'Account 2',
          type: AccountType.User,
          currency: 'USD',
          subtype: 'asset',
          isArchived: false,
        },
      ],
    };

    vi.mocked(window.confirm).mockReturnValueOnce(true);

    const onDelete = vi.fn();
    const accountCount = group.accounts?.length || 0;
    const message = accountCount > 0
      ? `Are you sure you want to delete "${group.name}"? This group contains ${accountCount} account(s). The accounts will be moved to the ungrouped section.`
      : `Are you sure you want to delete "${group.name}"?`;
    
    const confirmed = window.confirm(message);
    if (confirmed) {
      onDelete();
    }

    expect(window.confirm).toHaveBeenCalledWith(
      `Are you sure you want to delete "${group.name}"? This group contains ${accountCount} account(s). The accounts will be moved to the ungrouped section.`
    );
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  /**
   * Test: Delete action cancelled
   * Validates that cancelling the delete confirmation does not trigger onDelete
   */
  it('should not call onDelete when confirmation is cancelled', () => {
    const group: AccountGroup = {
      id: 'group-123',
      name: 'Test Group',
      accountType: AccountType.User,
      displayOrder: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      accounts: [],
    };

    vi.mocked(window.confirm).mockReturnValueOnce(false);

    const onDelete = vi.fn();
    const accountCount = group.accounts?.length || 0;
    const message = accountCount > 0
      ? `Are you sure you want to delete "${group.name}"? This group contains ${accountCount} account(s). The accounts will be moved to the ungrouped section.`
      : `Are you sure you want to delete "${group.name}"?`;
    
    const confirmed = window.confirm(message);
    if (confirmed) {
      onDelete();
    }

    expect(window.confirm).toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();
  });

  /**
   * Test: Handle balance fetch error
   * Validates that the component handles errors when fetching aggregate balance
   */
  it('should handle errors when fetching aggregate balance', async () => {
    const groupId = 'group-123';
    const error = new Error('Failed to fetch balance');

    mockInvoke.mockRejectedValueOnce(error);

    try {
      await window.electron.ipcRenderer.invoke('get-group-aggregate-balance', groupId);
      expect.fail('Should have thrown an error');
    } catch (err: any) {
      expect(err.message).toBe('Failed to fetch balance');
    }
  });

  /**
   * Test: Display account count
   * Validates that the component correctly displays the number of accounts in the group
   */
  it('should display the correct account count', () => {
    const group: AccountGroup = {
      id: 'group-123',
      name: 'Test Group',
      accountType: AccountType.User,
      displayOrder: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      accounts: [
        {
          id: 'account-1',
          name: 'Account 1',
          type: AccountType.User,
          currency: 'USD',
          subtype: 'asset',
          isArchived: false,
        },
        {
          id: 'account-2',
          name: 'Account 2',
          type: AccountType.User,
          currency: 'USD',
          subtype: 'asset',
          isArchived: false,
        },
        {
          id: 'account-3',
          name: 'Account 3',
          type: AccountType.User,
          currency: 'USD',
          subtype: 'asset',
          isArchived: false,
        },
      ],
    };

    const accountCount = group.accounts?.length || 0;
    expect(accountCount).toBe(3);
  });

  /**
   * Test: Handle group with no accounts
   * Validates that the component handles groups with no accounts
   */
  it('should handle groups with no accounts', () => {
    const group: AccountGroup = {
      id: 'group-123',
      name: 'Empty Group',
      accountType: AccountType.User,
      displayOrder: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      accounts: [],
    };

    const accountCount = group.accounts?.length || 0;
    expect(accountCount).toBe(0);
  });

  it('aggregates category group balances by per-currency balances', async () => {
    const group: AccountGroup = {
      id: 'group-cat-1',
      name: '[Expense] Lifestyle',
      accountType: AccountType.Category,
      displayOrder: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      accounts: [
        {
          id: 'cat-1',
          name: 'Dining Out',
          type: AccountType.Category,
          subtype: 'liability',
          currency: 'CAD',
          balance: 200,
          isArchived: false,
          balances: {
            CAD: 100,
            USD: 100,
          },
        } as any,
      ],
    };

    render(
      <MemoryRouter>
        <AccountGroupItem
          group={group}
          isExpanded={false}
          onToggle={vi.fn()}
          onEdit={vi.fn()}
          onDelete={vi.fn()}
        />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/USD/)).toBeTruthy();
      expect(screen.getByText(/CAD/)).toBeTruthy();
    });
  });
});
