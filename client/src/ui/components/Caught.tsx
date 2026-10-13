/** An error boundary per screen: one failing window falls alone, logged under its name. */

import { Component, type ComponentChildren, type JSX } from 'preact';

import { logger } from '../../core/log';

const log = logger('ui');

export interface CaughtProps {
  /** What is being drawn, for the line written when it fails. */
  what: string;
  children: ComponentChildren;
}

interface CaughtState {
  /** Why it fell, or nothing while it is standing. */
  fell: string | null;
}

export class Caught extends Component<CaughtProps, CaughtState> {
  state: CaughtState = { fell: null };

  componentDidCatch(error: unknown): void {
    const said = error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error);
    log.error(`${this.props.what} fell: ${said}`);
    this.setState({ fell: said });
  }

  componentDidUpdate(before: CaughtProps): void {
    // A different thing in the same place is a fresh start: the window
    // that failed is gone, and whatever replaced it has not.
    if (before.what !== this.props.what && this.state.fell) this.setState({ fell: null });
  }

  render(): JSX.Element | null {
    if (this.state.fell) return null;
    return <>{this.props.children}</>;
  }
}
