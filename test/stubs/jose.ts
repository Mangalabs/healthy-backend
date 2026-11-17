// `jose` é só ESM e o Jest roda em CommonJS. Os testes de integração não usam
// login social, então um substituto basta.
export const createRemoteJWKSet = () => () => {
  throw new Error('jose não está disponível nos testes de integração');
};
export const jwtVerify = () => {
  throw new Error('jose não está disponível nos testes de integração');
};
