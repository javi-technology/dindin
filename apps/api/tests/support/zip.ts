import { deflateRawSync } from 'zlib';

/**
 * Monta um ZIP com um único arquivo comprimido (deflate), como o COTAHIST que
 * a B3 publica. Só para os testes: o leitor de produção não depende disto.
 */
export function buildZip(fileName: string, content: Buffer): Buffer {
  const name = Buffer.from(fileName, 'latin1');
  const compressed = deflateRawSync(content);

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4); // versão necessária
  local.writeUInt16LE(0, 6); // flags
  local.writeUInt16LE(8, 8); // deflate
  local.writeUInt32LE(0, 14); // CRC (não conferido pelo leitor)
  local.writeUInt32LE(compressed.length, 18);
  local.writeUInt32LE(content.length, 22);
  local.writeUInt16LE(name.length, 26);
  local.writeUInt16LE(0, 28);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0, 8);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(0, 16);
  central.writeUInt32LE(compressed.length, 20);
  central.writeUInt32LE(content.length, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt32LE(0, 42); // deslocamento do cabeçalho local

  const centralOffset = local.length + name.length + compressed.length;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + name.length, 12);
  end.writeUInt32LE(centralOffset, 16);

  return Buffer.concat([local, name, compressed, central, name, end]);
}
