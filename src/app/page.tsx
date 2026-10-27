export default function Home() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-16">
      <p className="font-mono text-sm tracking-wide text-stamp uppercase">Unclaimed</p>
      <h1 className="mt-3 font-display text-4xl font-semibold leading-tight">
        The scholarships you can still claim, checked rule by rule.
      </h1>
      <p className="mt-4 max-w-xl text-lg">
        Coming online. An agent on Nebius Token Factory with NVIDIA Nemotron reads the official
        portals, checks each eligibility rule against you with a quote from the source, and gives
        you a dated plan.
      </p>
      <div className="mt-10 border-t border-rule pt-4 font-mono text-sm">
        Build in progress for the Nebius x NVIDIA Global AI Hackathon.
      </div>
    </main>
  );
}
