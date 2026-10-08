// Bevestiging bij destructieve acties (UX-07, §12.1). Injecteerbare wrapper om Alert.alert, teksten uit strings.nl.ts.
// Een store-actie roept de facade pas ná de keuze aan.
import { strings } from './strings.nl';

export interface AlertButton {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
}

export type AlertFn = (title: string, message: string, buttons: AlertButton[]) => void;

export type ConfirmKind = 'delete-list-local' | 'delete-list-shared' | 'leave' | 'clear-checked';
export type Choice = 'cancel' | 'confirm' | 'leave' | 'leave-keep' | 'leave-delete';

export function confirmDestructive(alert: AlertFn, kind: ConfirmKind, ctx: { name?: string; count?: number }): Promise<Choice> {
  const c = strings.confirm;
  const name = ctx.name ?? '';
  return new Promise<Choice>((resolve) => {
    const cancel: AlertButton = { text: strings.cancel, style: 'cancel', onPress: () => resolve('cancel') };
    switch (kind) {
      case 'delete-list-local':
        alert(c.deleteLocalTitle, c.deleteLocalBody(name), [cancel, { text: c.deleteButton, style: 'destructive', onPress: () => resolve('confirm') }]);
        break;
      case 'delete-list-shared':
        alert(c.deleteSharedTitle, c.deleteSharedBody(name), [
          cancel,
          { text: strings.leaveList, onPress: () => resolve('leave') },
          { text: c.deleteEverywhere, style: 'destructive', onPress: () => resolve('confirm') },
        ]);
        break;
      case 'leave':
        alert(c.leaveTitle, c.leaveBody(name), [
          cancel,
          { text: c.leaveKeep, onPress: () => resolve('leave-keep') },
          { text: c.leaveDelete, style: 'destructive', onPress: () => resolve('leave-delete') },
        ]);
        break;
      case 'clear-checked':
        alert(c.clearTitle, c.clearBody(ctx.count ?? 0), [cancel, { text: c.clearButton, style: 'destructive', onPress: () => resolve('confirm') }]);
        break;
    }
  });
}
