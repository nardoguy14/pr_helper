import { showNotification as electronNotify, isElectron } from '../utils/electron';
import { PullRequest } from '../types';

export class NotificationService {
  private static hasPermission: boolean = false;

  static async requestPermission(): Promise<boolean> {
    if (isElectron()) {
      // Electron handles permissions automatically
      this.hasPermission = true;
      return true;
    }

    if ('Notification' in window) {
      const permission = await Notification.requestPermission();
      this.hasPermission = permission === 'granted';
      return this.hasPermission;
    }

    return false;
  }

  static async notifyPRUpdate(pr: PullRequest, updateType: 'new_pr' | 'updated' | 'closed' | 'assigned' | 'review_requested') {
    if (!this.hasPermission && !isElectron()) {
      await this.requestPermission();
    }

    let title = '';
    let body = '';

    switch (updateType) {
      case 'new_pr':
        title = '📝 New Pull Request';
        body = `${pr.user.login} opened PR #${pr.number}: ${pr.title}`;
        break;
      case 'assigned':
        title = '👤 PR Assigned to You';
        body = `You've been assigned to PR #${pr.number}: ${pr.title}`;
        break;
      case 'review_requested':
        title = '👀 Review Requested';
        body = `Your review is requested on PR #${pr.number}: ${pr.title}`;
        break;
      case 'updated':
        if (pr.user_is_requested_reviewer) {
          title = '🔄 Review Requested';
          body = `You're requested to review PR #${pr.number}: ${pr.title}`;
        } else {
          title = '🔄 PR Updated';
          body = `PR #${pr.number} was updated: ${pr.title}`;
        }
        break;
      case 'closed':
        title = '✅ PR Closed';
        body = `PR #${pr.number} was ${pr.merged_at ? 'merged' : 'closed'}: ${pr.title}`;
        break;
    }

    if (title && body) {
      electronNotify(title, body);
    }
  }

  static async notifyNewAssignment(pr: PullRequest) {
    await this.notifyPRUpdate(pr, 'assigned');
  }

  static async notifyNewReviewRequest(pr: PullRequest) {
    await this.notifyPRUpdate(pr, 'review_requested');
  }

  static notifyMultiplePRs(count: number, repository?: string) {
    const title = 'Multiple PR Updates';
    const body = repository 
      ? `${count} PRs updated in ${repository}`
      : `${count} PRs updated across your repositories`;
    
    electronNotify(title, body);
  }
}