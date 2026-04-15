import React from "react";
import { RESOURCE_EMOJIS, type GameNotification } from "../../simulation/game";

interface NotificationsProps {
  notifications: GameNotification[];
}

export const Notifications: React.FC<NotificationsProps> = React.memo(({
  notifications,
}) => {
  if (notifications.length === 0) return null;

  return (
    <div className="fi-notifications">
      {notifications.map((n) => (
        <div key={n.id} className={`fi-notification ${n.kind === "error" ? "fi-notification--error" : ""}`}>
          <span className="fi-notification-emoji">
            {n.kind === "error" ? "⚠️" : (RESOURCE_EMOJIS[n.resource] ?? "📦")}
          </span>
          <span>
            {n.kind === "error" ? n.displayName : `+${n.amount} ${n.displayName}`}
          </span>
        </div>
      ))}
    </div>
  );
});
