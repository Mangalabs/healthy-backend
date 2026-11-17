import { SlidingWindowLimiter } from './rate-limiter';

describe('SlidingWindowLimiter', () => {
  const MIN = 60_000;

  function setup() {
    let now = 1_000_000;
    const limiter = new SlidingWindowLimiter(
      [
        { max: 2, windowMs: 10 * MIN },
        { max: 3, windowMs: 60 * MIN },
      ],
      () => now,
    );
    return {
      limiter,
      advance: (ms: number) => {
        now += ms;
      },
    };
  }

  it('permite até o máximo e depois avisa quanto falta', () => {
    const { limiter } = setup();
    expect(limiter.consume('a')).toBeNull();
    expect(limiter.consume('a')).toBeNull();
    expect(limiter.consume('a')).toBe(10 * MIN);
  });

  it('libera de novo quando o uso mais antigo sai da janela', () => {
    const { limiter, advance } = setup();
    limiter.consume('a');
    advance(MIN);
    limiter.consume('a');
    advance(9 * MIN);
    expect(limiter.consume('a')).toBeNull();
  });

  it('respeita também a janela mais longa', () => {
    const { limiter, advance } = setup();
    limiter.consume('a');
    limiter.consume('a');
    advance(11 * MIN);
    limiter.consume('a');
    advance(11 * MIN);
    const wait = limiter.consume('a');
    expect(wait).not.toBeNull();
    expect(wait).toBeGreaterThan(0);
  });

  it('conta cada chave separadamente', () => {
    const { limiter } = setup();
    limiter.consume('a');
    limiter.consume('a');
    expect(limiter.consume('a')).not.toBeNull();
    expect(limiter.consume('b')).toBeNull();
  });

  it('um uso negado não conta como uso', () => {
    const { limiter, advance } = setup();
    limiter.consume('a');
    limiter.consume('a');
    limiter.consume('a');
    limiter.consume('a');
    advance(10 * MIN);
    expect(limiter.consume('a')).toBeNull();
  });
});
