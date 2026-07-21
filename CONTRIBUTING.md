## Contributing to mepto

**Thanks for helping out!**

In order for your code to make it in, several conditions must be met:

* It's more likely your pull request will make it in if you adhere to **mepto's
  project goals**. Be sure to read the README in its entirety before setting out
  to code.
* Please talk to the maintainers (@madrobby and @mislav) first if you want
  to write a plugin, those are better kept in their own repositories.
* Fix only ONE thing or have only ONE feature in your pull request. 
  If you have multiple unrelated code updates, please submit a separate pull request for each one.
* **Your pull request must be written in English and be accompanied by a
  detailed description**, ideally something we can use as documentation.
  If you're not fluent in English, try your best and let us know so we'll help!
* Changes to jQuery-based API methods **must match their jQuery counterparts**.
* Please **do not just copy code from jQuery**. mepto strives for API compatibility,
  but has different goals for code style and size and target platforms.
  In case you do copy code, you must clearly indicate the origin of the code, and
  which license applies to it. However, it is likely your patch will be denied.
* **All code must have tests, and all tests must pass.** See the README on running the test suite.
* Please **also test manually** on as many target platforms you have access to,
  but at least on latest Chrome (desktop) and Firefox (desktop).
  See http://meptojs.com for a full list of platforms.
* It's required that you follow mepto's **code style guidelines** (see below)

Whew, now that we have that out of the way thanks again!

## Required local checks

CI runs these on every push and PR. Run the same sequence locally before pushing:

~~~sh
$ npm ci || npm install
$ npm run typecheck
$ npm run lint
$ npm run format:check
$ npm test
$ npx playwright install --with-deps chromium
$ npx playwright test --project=chromium
$ npm run build
$ npm run size
~~~

The first run after this workflow lands will fail on the existing
lint/typecheck/format debt; that is expected and is being fixed in
follow-up PRs. **Do not silence these gates to make CI green.** If a
check is blocking you on something you are not responsible for, open a
narrow PR against that one gate and link it from your PR.

## Code style guidelines

* Two spaces "soft tabs" indentation
* Remove any trailing whitespace from the end of lines
* `function name() { }` for named functions
* `function(){ }` for anonymous functions
* No curly braces for single-line control flow statements such as `if` & friends
* Don't write [semicolons that are optional][optional]
* Put a single semicolon _before_ statements that start with `(` or `[`
  (see above article as for why it's needed)
* Use long, descriptive variable and method names
* Use blank lines to separate "paragraphs" of code for readability
* Use comments to describe non-obvious code behavior


  [optional]: http://mislav.uniqpath.com/2010/05/semicolons/
