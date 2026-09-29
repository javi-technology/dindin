// ---------------------------------------------------------------------------
// Contratos compartilhados entre api, web e o app Flutter (issue #399).
//
// Este arquivo era escrito à mão, e o app Flutter não teria como consumi-lo:
// o contrato seria repetido em Dart e um campo renomeado na API só apareceria
// no celular do usuário, depois de o deploy ter passado no CI.
//
// A fonte passou a ser `openapi/dindin.yaml`. Daqui sai o mesmo conjunto de
// nomes de antes — agora gerado, e dos mesmos schemas que produzem os modelos
// Dart do app. Para alterar um contrato, edite a descrição e rode
// `npm run contracts:gen`; o `generated.ts` não é editado à mão.
// ---------------------------------------------------------------------------

export * from './generated';
