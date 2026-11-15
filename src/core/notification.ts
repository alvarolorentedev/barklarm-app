import { State } from '../types/State';
import { Status } from '../types/Status';
import { translate } from './i18n';

export type NotificationPresenter = (title: string, body: string) => void;

export class NotificationManager {
  constructor(private readonly showNotification: NotificationPresenter) {}

  updateNotifications(oldStates: State[], actualStates: State[]): void {
    actualStates.forEach((current) => {
      if (current.muted) return;
      const previous = oldStates.find(({ name }) => name === current.name) || ({ status: Status.NA } as State);
      if (current.status === previous.status) return;

      const titleMap: Record<Status, string> = {
        [Status.FAILURE]: translate('Failed'),
        [Status.SUCCESS]: translate('Succeeded'),
        [Status.CHECKING]: translate('Checking'),
        [Status.NA]: translate('Unaccesible'),
      };

      this.showNotification(titleMap[current.status], `${current.name} ${titleMap[current.status]}`);
    });
  }
}
