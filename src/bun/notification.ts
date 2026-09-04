import { State } from '../types/State';
import { Status } from '../types/Status';
import { translate } from './i18n';
import { Utils } from 'electrobun/main';

function showNotification(title: string, body: string): void {
  try {
    Utils.showNotification({ title, body });
  } catch {
    console.log(`[Notification] ${title}: ${body}`);
  }
}

export class NotificationManager {
  updateNotifications(old: State[], actual: State[]): void {
    actual.forEach((current) => {
      if (current.muted) return;
      const previous = old.find(({ name }) => name === current.name) || ({ status: Status.NA } as State);
      if (current.status === previous.status) return;

      const titleMap: Record<Status, string> = {
        [Status.FAILURE]: translate('Failed'),
        [Status.SUCCESS]: translate('Succeeded'),
        [Status.CHECKING]: translate('Checking'),
        [Status.NA]: translate('Unaccesible'),
      };

      showNotification(titleMap[current.status], `${current.name} ${titleMap[current.status]}`);
    });
  }
}
