## Purpose

This capability preloads a known LINE user's customer profile into the voice agent's conversation instructions at session start, so the assistant can greet the user by name and reference recent order history without asking again for information already on file.

## ADDED Requirements

### Requirement: Voice session token includes customer profile

The system SHALL look up the customer profile for the identified LINE user when issuing a voice session token, and SHALL include the result as a `customerProfile` field in the response.

#### Scenario: Customer profile exists

- **WHEN** a client requests a voice session token for a LINE user who has a matching row in `customer_profiles`
- **THEN** the response includes a `customerProfile` object containing `display_name`, `member_tier`, `notes`, `last_order_summary`, and `extra_json`

#### Scenario: No customer profile on file

- **WHEN** a client requests a voice session token for a LINE user with no matching row in `customer_profiles`
- **THEN** the response includes `customerProfile: null` and the token issuance otherwise succeeds unchanged

### Requirement: Customer profile lookup failure does not block token issuance

The system SHALL NOT fail voice session token issuance when the customer profile lookup throws an error.

#### Scenario: Database query throws during lookup

- **WHEN** the `customer_profiles` query throws an exception while issuing a voice session token
- **THEN** the system logs the error, treats `customerProfile` as `null`, and still returns HTTP 200 with a valid `clientSecret`

### Requirement: Customer profile hint is appended to voice agent instructions

The system SHALL build a natural-language hint from the customer profile and append it to the voice agent's session instructions alongside the existing roster and memory hints.

#### Scenario: Hint built with a known profile

- **WHEN** the frontend receives a non-null `customerProfile` from the voice session token response
- **THEN** the composed session instructions include a hint block listing the known name, member tier, recent order summary, and notes drawn from that profile

#### Scenario: Hint built with no profile

- **WHEN** the frontend receives `customerProfile: null` from the voice session token response
- **THEN** the composed session instructions include a hint explicitly stating no customer file is preloaded and instructing the agent not to pretend to know the caller

### Requirement: Agent must not fabricate unknown customer details

The system SHALL instruct the voice agent to rely only on information the caller states when no customer profile is preloaded, and SHALL NOT allow the absence of a profile to produce fabricated membership tier or order details.

#### Scenario: No profile, caller not previously known

- **WHEN** a voice session starts with `customerProfile: null`
- **THEN** the agent asks the caller for information from scratch and does not state any membership tier, order history, or contact details that were not provided by the caller in this conversation

### Requirement: Spoken statements take precedence over stale profile data

The system SHALL instruct the voice agent to prefer what the caller says in the current conversation over conflicting data in the preloaded customer profile, and to confirm the discrepancy verbally.

#### Scenario: Caller states information that conflicts with the profile

- **WHEN** the caller provides a value that differs from the corresponding field in the preloaded customer profile
- **THEN** the agent uses the value the caller stated in this conversation, and verbally confirms the update with the caller before proceeding

### Requirement: Customer profile content is not exposed outside the agent prompt

The system SHALL NOT display the full customer profile content in the visible transcript UI, and SHALL NOT expose internal identifiers such as the LINE user ID or raw `extra_json` content through the agent prompt.

#### Scenario: Profile hint composed for the agent

- **WHEN** the customer profile hint is built for the session instructions
- **THEN** the hint text contains only the display name, member tier, recent order summary, and notes, and does not contain the LINE user ID or the raw `extra_json` payload

### Requirement: Existing voice intake behavior is unaffected

The system SHALL preserve existing behavior of user memory recall, voice intake submission, and identity verification unchanged by the introduction of customer profile preloading.

#### Scenario: Saved memory still applies

- **WHEN** a LINE user with previously saved memory (phone/email/address) starts a new voice session
- **THEN** the saved memory is still included in the session instructions exactly as before this capability was added

#### Scenario: Missing idToken still rejected with 400

- **WHEN** a voice session token request is made without an idToken at all
- **THEN** the system still returns HTTP 400, unaffected by the customer profile lookup

#### Scenario: Invalid idToken still rejected with 401

- **WHEN** a voice session token request is made with an idToken that fails LINE identity verification
- **THEN** the system still returns HTTP 401, unaffected by the customer profile lookup
