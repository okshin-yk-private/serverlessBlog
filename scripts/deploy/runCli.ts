import type { Command } from 'commander';
import { InvalidArgumentError } from 'commander';

/** Keep unfinished SDK promises alive, but never beyond the CLI deadline. */
export async function runCli(program: Command): Promise<void> {
  program.option(
    '--timeout-seconds <seconds>',
    'Maximum duration of the command, including public verification',
    (value: string) => {
      const seconds = Number(value);
      if (!Number.isInteger(seconds) || seconds < 1 || seconds > 3600) {
        throw new InvalidArgumentError('Expected an integer from 1 to 3600');
      }
      return seconds;
    },
    300
  );

  let deadline: ReturnType<typeof setTimeout> | undefined;
  program.hook('preAction', () => {
    // Deliberately referenced: an unresolved Promise alone need not keep a
    // process alive. Exiting also prevents later SDK callbacks from publishing.
    deadline = setTimeout(() => {
      console.error(
        'Deployment deadline exceeded; completion is unconfirmed. The pointer may already be active; inspect it before retrying or rolling back.'
      );
      process.exit(1);
    }, program.opts().timeoutSeconds * 1000);
  });

  process.exitCode = 1;
  try {
    await program.parseAsync();
    process.exitCode = 0;
  } finally {
    if (deadline) clearTimeout(deadline);
  }
}
