import Image from "next/image";
export function Brand() {
  return (
    <div>
      <Image
        className="logo-light"
        src="/brand/ilead-wordmark-ink.svg"
        width={185}
        height={51}
        alt="iLead platform"
        priority
      />
      <Image
        className="logo-dark"
        src="/brand/ilead-wordmark-white.svg"
        width={185}
        height={51}
        alt="iLead platform"
        priority
      />
    </div>
  );
}
