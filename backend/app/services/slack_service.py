import httpx
import logging
from typing import Optional, Dict, Any
from datetime import datetime

from app.core.config import settings
from app.models.pr_models import PullRequest

logger = logging.getLogger(__name__)


class SlackService:
    def __init__(self):
        self.webhook_url = settings.SLACK_WEBHOOK_URL
        self.bot_token = settings.SLACK_BOT_TOKEN
        self.client = httpx.AsyncClient(timeout=30.0)
    
    async def __aenter__(self):
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.client.aclose()
    
    async def send_pr_review_notification(
        self, 
        pull_request: PullRequest, 
        notification_type: str = "review_requested"
    ) -> bool:
        if not self.webhook_url:
            logger.warning("Slack webhook URL not configured")
            return False
        
        try:
            message = self._build_pr_notification_message(pull_request, notification_type)
            response = await self.client.post(self.webhook_url, json=message)
            response.raise_for_status()
            
            logger.info(f"Slack notification sent for PR #{pull_request.number}")
            return True
        except Exception as e:
            logger.error(f"Failed to send Slack notification: {e}")
            return False
    
    async def send_custom_message(self, text: str, channel: Optional[str] = None) -> bool:
        if not self.webhook_url:
            logger.warning("Slack webhook URL not configured")
            return False
        
        try:
            message = {"text": text}
            if channel:
                message["channel"] = channel
            
            response = await self.client.post(self.webhook_url, json=message)
            response.raise_for_status()
            
            logger.info("Custom Slack message sent successfully")
            return True
        except Exception as e:
            logger.error(f"Failed to send custom Slack message: {e}")
            return False
    
    def _build_pr_notification_message(
        self, 
        pull_request: PullRequest, 
        notification_type: str
    ) -> Dict[str, Any]:
        color = self._get_notification_color(notification_type)
        title = self._get_notification_title(notification_type)
        
        message = {
            "text": f"{title}: {pull_request.title}",
            "attachments": [
                {
                    "color": color,
                    "title": pull_request.title,
                    "title_link": pull_request.html_url,
                    "fields": [
                        {
                            "title": "Repository",
                            "value": pull_request.repository.full_name,
                            "short": True
                        },
                        {
                            "title": "Author",
                            "value": f"<{pull_request.user.html_url}|{pull_request.user.login}>",
                            "short": True
                        },
                        {
                            "title": "PR Number",
                            "value": f"#{pull_request.number}",
                            "short": True
                        },
                        {
                            "title": "Status",
                            "value": pull_request.status.value.replace("_", " ").title(),
                            "short": True
                        }
                    ],
                    "actions": [
                        {
                            "type": "button",
                            "text": "View PR",
                            "url": pull_request.html_url,
                            "style": "primary"
                        }
                    ],
                    "footer": "PR Monitor",
                    "ts": int(datetime.utcnow().timestamp())
                }
            ]
        }
        
        if pull_request.body:
            description = pull_request.body[:200] + "..." if len(pull_request.body) > 200 else pull_request.body
            message["attachments"][0]["text"] = description
        
        if pull_request.assignees:
            assignees_text = ", ".join([
                f"<{assignee.html_url}|{assignee.login}>" 
                for assignee in pull_request.assignees
            ])
            message["attachments"][0]["fields"].append({
                "title": "Assignees",
                "value": assignees_text,
                "short": False
            })
        
        if pull_request.requested_reviewers:
            reviewers_text = ", ".join([
                f"<{reviewer.html_url}|{reviewer.login}>" 
                for reviewer in pull_request.requested_reviewers
            ])
            message["attachments"][0]["fields"].append({
                "title": "Requested Reviewers",
                "value": reviewers_text,
                "short": False
            })
        
        return message
    
    def _get_notification_color(self, notification_type: str) -> str:
        color_map = {
            "review_requested": "#f1c21b",  # Yellow - needs review
            "review_completed": "#198038",  # Green - reviewed
            "changes_requested": "#da1e28", # Red - changes needed
            "pr_updated": "#0f62fe",        # Blue - updated
            "pr_merged": "#198038",         # Green - merged
            "pr_closed": "#8d8d8d"          # Gray - closed
        }
        return color_map.get(notification_type, "#0f62fe")
    
    def _get_notification_title(self, notification_type: str) -> str:
        title_map = {
            "review_requested": "📋 PR Review Requested",
            "review_completed": "✅ PR Review Completed",
            "changes_requested": "🔄 Changes Requested on PR",
            "pr_updated": "📝 PR Updated",
            "pr_merged": "🎉 PR Merged",
            "pr_closed": "🚫 PR Closed"
        }
        return title_map.get(notification_type, "📋 PR Notification")


slack_service = SlackService()