// JAN コード（バーコードの数字）の確かめ方。最後の1桁はチェックデジットで、読み間違いを見つけられる。
// 13桁（JAN-13）と8桁（JAN-8）に対応する。

export function isValidJan(code: string): boolean {
  if (!/^(\d{8}|\d{13})$/.test(code)) return false;
  const digits = [...code].map(Number);
  const check = digits.pop() as number;
  // 右から数えて奇数番目（チェックデジットの左隣から）に 3 をかける
  const sum = digits.reverse().reduce((s, d, i) => s + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

/** 全角数字や空白・ハイフンを取り除いて、数字だけにする */
export const cleanJan = (input: string): string => input.normalize("NFKC").replace(/[^\d]/g, "");
