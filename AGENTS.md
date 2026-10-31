<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Settlement logic lives behind the `SettlementAdapter` interface in `src/lib/settlement/`; UI imports only `settlement` from its index, so a real BCH/XO adapter can replace the mock without UI changes.
- Simulated references must be labeled "Demo reference" and never resemble real transaction IDs; demo orders persist only in browser localStorage.
- Generate the demo handoff code in settlement creation, preserve it in later transitions, and gate its rendered value by Seller role; this keeps persistence and visibility independent of navigation.
