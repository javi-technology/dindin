import { Submission } from './submission.util';

// ---------------------------------------------------------------------------
// Controle de envio em andamento (issue #497)
//
// Um clique repetido, ou um clique com a resposta lenta, não pode virar duas
// gravações: numa carteira isso é posição em duplicidade e quantidade dobrada.
// ---------------------------------------------------------------------------

describe('Submission', () => {
  it('deve começar livre', () => {
    expect(new Submission().pending()).toBe(false);
  });

  it('deve ocupar no primeiro start e autorizar o envio', () => {
    const submission = new Submission();

    expect(submission.start()).toBe(true);
    expect(submission.pending()).toBe(true);
  });

  it('deve recusar o segundo start enquanto o primeiro não terminou', () => {
    const submission = new Submission();
    submission.start();

    expect(submission.start()).toBe(false);
    expect(submission.pending()).toBe(true);
  });

  it('deve liberar um novo envio depois do finish', () => {
    const submission = new Submission();
    submission.start();

    submission.finish();

    expect(submission.pending()).toBe(false);
    expect(submission.start()).toBe(true);
  });
});
