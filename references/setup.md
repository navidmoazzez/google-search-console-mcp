# Setup

Getting a credential Google will accept. This is the part people abandon, so it
is written out in full.

Two routes. Pick one.

| | Use it when |
|---|---|
| [Sign in with your Google account](#sign-in-with-your-google-account) | You are running this on your own machine. Almost everyone. |
| [Service account](#service-account) | Running on a server, in CI, or anywhere without a browser. |

Both need a Google Cloud project, because Google does not hand out Search
Console access without one. It is free and takes about five minutes.

---

## Sign in with your Google account

### 1. Make a Google Cloud project

Go to [console.cloud.google.com](https://console.cloud.google.com). If this is
your first project, Google prompts you to create one. Otherwise use the project
picker at the top of the page and create a new one.

Name it whatever you like. Nothing about the name is visible to anyone else.

### 2. Turn on the two APIs

A project starts with every API switched off, and the errors you get from a
disabled API do not say that is the problem.

Open [the API library](https://console.cloud.google.com/apis/library), search
for each of these and enable it:

- **Google Search Console API**, for the search analytics, sitemaps and URL inspection
- **Google Site Verification API**, only needed to claim a new property. Skip it if you never will.

### 3. Set up the consent screen

Open **Google Auth platform**, then **Branding**
([direct link](https://console.developers.google.com/auth/branding)). If nothing
is configured yet, click **Get Started**.

Fill in an **App name** and pick your own address as the **User support email**,
then **Next**.

On **Audience**, choose **External** unless you are on Google Workspace and only
you will use it, in which case **Internal** is simpler. Then **Next**.

If you chose External, find the **Test users** section and click **Add users**.
Add your own Google address. Without this, Google refuses the sign-in and the
error does not tell you why.

### 4. Publish it, or it stops working after a week

This is the single most common reason a Google integration dies quietly, and it
is worth doing now rather than in seven days.

While the app's publishing status is **Testing**, Google's own documentation
says a project "configured for an external user type and a publishing status of
'Testing' is issued a refresh token expiring in 7 days" for any scope beyond
basic profile information. Search Console is well beyond that.

So on the **Audience** page, click **Publish app**.

Google shows a warning about verification. You can ignore it here: verification
is only required to show the consent screen to people outside your test users,
and this app has exactly one user, you. The unverified-app screen appears at
sign-in, where you click **Advanced** and then **Go to (your app name)**.

An **Internal** app does not have this problem at all.

### 5. Create the OAuth client

Open **Google Auth platform**, then **Clients**, and click **Create Client**.

Set **Application type** to **Desktop app**, give it a name, and click
**Create**.

Google shows a client ID and a client secret. Copy both. The secret is
retrievable later from the same page, so losing it is not fatal.

> A desktop client's secret is not really a secret. It ships inside whatever
> config file you paste it into, which is why the sign-in also uses PKCE. Treat
> it as an identifier, not a password.

### 6. Sign in

```bash
export GSC_CLIENT_ID="...apps.googleusercontent.com"
export GSC_CLIENT_SECRET="GOCSPX-..."

npx -y @thenavidm/google-search-console-mcp@latest login
```

A browser opens. Pick the Google account that owns your Search Console
properties, which is not always the one you are signed into first.

The refresh token is written to `~/.google-search-console-mcp/tokens.json`,
readable only by you. Nothing is sent anywhere else.

### 7. Check it

```bash
npx -y @thenavidm/google-search-console-mcp@latest doctor
```

It names which account it is using and how many properties that account can
reach. Zero properties means you signed in with the wrong Google account.

---

## Service account

For a server, a scheduled job, or CI, where there is no browser to open.

Steps 1 and 2 above are the same: a project, with both APIs enabled.

### 1. Create the service account

Open
[**IAM & Admin**, then **Service Accounts**](https://console.cloud.google.com/iam-admin/serviceaccounts)
and create one. It needs no project roles at all: the access that matters is
granted inside Search Console, not in Cloud IAM.

Open it, go to **Keys**, then **Add key**, then **Create new key**, and choose
**JSON**. The file downloads once.

### 2. Give it access to your properties

**This is the step people miss.** A service account is a separate identity with
its own email address, something like
`gsc-reader@your-project.iam.gserviceaccount.com`. Creating it grants it nothing.

For each property, open [Search Console](https://search.google.com/search-console),
select the property, then **Settings**, then **Users and permissions**. Click
**Add user**, paste the service account's email, and pick a permission level:

| | What it can do |
|---|---|
| **Restricted user** | Read search analytics. Cannot touch sitemaps or settings. |
| **Full user** | Read everything, and submit sitemaps. What most setups want. |
| **Owner** | Everything, including adding and removing users. |

Repeat for every property. There is no way to grant a service account access to
all of them at once.

### 3. Point the server at the key

```bash
export GSC_SERVICE_ACCOUNT_KEY=/secure/path/gsc-key.json
npx -y @thenavidm/google-search-console-mcp@latest doctor
```

If you would rather not put a file on disk, base64 the key and pass it inline:

```bash
export GSC_SERVICE_ACCOUNT_KEY_JSON="$(base64 < gsc-key.json)"
```

A service account cannot verify a new property. Site verification is tied to a
human Google account, so `verify_site` needs the browser sign-in.

---

## Revoking access

**The browser sign-in.** `logout <email>` removes the local copy. To revoke
Google's grant as well, go to
[myaccount.google.com/permissions](https://myaccount.google.com/permissions),
find the app by the name you gave it, and remove it. Do both: deleting the local
file leaves a live grant behind.

**A service account.** Delete the key in Google Cloud, and remove the service
account's email from each property under **Settings**, then
**Users and permissions**.

---

## When it does not work

| What you see | What it is |
|---|---|
| It worked for a week, then stopped | The OAuth app is still in **Testing**. Publish it, step 4. |
| `User does not have sufficient permission` | The property string does not match. `https://example.com/` and `sc-domain:example.com` are different properties, and the trailing slash is part of the first one. Run `list_sites` and copy exactly. |
| `doctor` finds zero properties | Signed in with a Google account that owns none of them. Or, on a service account, its email was never added under **Users and permissions**. |
| `Search Console API has not been used in project ...` | Step 2. The API is off. |
| `invalid_grant` on every call | The grant was revoked, or expired under Testing status. Run `login` again. |
| `unauthorized_client` | `GSC_CLIENT_ID` now points at a different OAuth client than the one you signed in with. A refresh token only works with the client that minted it. Run `login` again. |
