import { stdin, stdout } from "node:process";

export function prompt(text: string): Promise<string> {
  return readLineImpl(
    text,
    (ch) => stdout.write(ch),
    () => stdout.write("\b \b"),
  );
}

export function promptSecret(text: string): Promise<string> {
  return readLineImpl(
    text,
    () => {},
    () => {},
  );
}

function readLineImpl(
  text: string,
  onChar: (ch: string) => void,
  onBackspace: () => void,
): Promise<string> {
  stdout.write(text);
  return new Promise((resolve, reject) => {
    const chunks: string[] = [];
    const isTTY = stdin.isTTY ?? false;
    const wasRaw = isTTY ? (stdin.isRaw ?? false) : false;
    if (isTTY) stdin.setRawMode(true);
    stdin.resume();

    const finish = (value: string | null, err: Error | null) => {
      stdin.off("data", onData);
      if (isTTY) stdin.setRawMode(wasRaw);
      stdin.pause();
      if (err) reject(err);
      else resolve(value as string);
    };

    const onData = (buf: Buffer) => {
      const s = buf.toString("utf8");
      for (const ch of s) {
        if (ch === "\n" || ch === "\r") {
          stdout.write("\n");
          finish(chunks.join(""), null);
          return;
        }
        if (ch === "\u0003") {
          stdout.write("\n");
          finish(null, new Error("Cancelled by user"));
          return;
        }
        if (ch === "\u007f" || ch === "\b") {
          if (chunks.length > 0) {
            chunks.pop();
            onBackspace();
          }
          continue;
        }
        chunks.push(ch);
        onChar(ch);
      }
    };
    stdin.on("data", onData);
  });
}
