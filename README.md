# ProofDrop Delivery Settlement

Build a new responsive web application called ProofDrop.



ProofDrop is a trust-minimized Bitcoin Cash delivery settlement system for high-value peer-to-peer commerce.



The core promise is:



"Secure the handoff, not just the payment."



The product helps a buyer, seller, and courier coordinate a delivery transaction. Payment should remain locked until the agreed collection and delivery confirmations are completed.



For this first phase, build only the polished product interface and a clearly separated local demo flow. Do not connect real blockchain payments yet.



Important rules:



1. Do not add an AI chatbot.

2. Do not add Gemini.

3. Do not request or include API keys.

4. Do not request wallet recovery phrases or private keys.

5. Do not add warranties, insurance, product NFTs, marketplace discovery, GPS tracking, route tracking, social feeds, subscriptions, or complex arbitration.

6. Do not claim that blockchain independently knows whether a package arrived.

7. Use accurate language such as "courier-confirmed collection" and "buyer-confirmed delivery."

8. Do not create fake BCH transaction IDs.

9. Any simulated transaction reference must be labeled "Demo reference."

10. Keep the settlement logic separate from the interface so a real BCH or XO adapter can be added later.

11. Do not depend on Lovable AI services.

12. Do not modify or import the PayChat project.



Create these screens:



1. A landing dashboard

2. Create delivery order

3. Review order terms

4. Buyer order view

5. Seller order view

6. Courier order view

7. Delivery confirmation

8. Settlement receipt



Use a serious payment infrastructure design:



1. Dark navy background

2. White and cool gray cards

3. Bitcoin Cash orange as the main accent

4. Green for completed states

5. Amber for pending states

6. Red only for blocked or disputed states

7. Clear typography

8. Strong spacing

9. Rounded cards without making the app look like a generic crypto dashboard

10. Lucide icons

11. Responsive layouts for mobile and desktop



The landing screen should display:



"Secure the handoff, not just the payment."



Use this supporting text:



"ProofDrop coordinates buyer, seller, and courier confirmations before releasing a BCH settlement."



Add a primary button:



"Create a delivery order"



Add an example order card:



Item: Used laptop

Amount locked: 0.017 BCH

Seller payment: 0.015 BCH

Courier fee: 0.002 BCH

Status: Awaiting collection



Create this settlement timeline:



1. Order created

2. Payment locked

3. Collection confirmed

4. Delivery confirmed

5. Settlement released



Each stage must show whether it is complete, current, waiting, or blocked.



The create order form should include:



1. Item name

2. Item description

3. Seller display name

4. Seller BCH address

5. Buyer BCH address

6. Courier display name

7. Courier BCH address

8. Item amount in BCH

9. Courier fee in BCH

10. Delivery deadline

11. Delivery confirmation method



For this demo, use:



"One-time delivery code"



Show a review screen before the order is created.



The review screen must show:



1. Total amount

2. Seller amount

3. Courier fee

4. Release condition

5. Refund condition

6. Delivery confirmation method



Use this release condition:



"Funds can be released after courier collection is confirmed and the buyer confirms delivery."



Use this refund condition:



"If collection is not confirmed before the deadline, the buyer may request a refund according to the settlement rules."



After an order is created, show:



1. Order ID

2. Item details

3. Buyer

4. Seller

5. Courier

6. Amount locked

7. Seller amount

8. Courier fee

9. Current status

10. Settlement timeline

11. Release conditions

12. Refund conditions

13. Activity history



Add a clearly labeled demo role switcher:



1. Buyer

2. Seller

3. Courier



Label it:



"Demo role"



Add a note:



"This role switcher is for demonstrating the prototype workflow. It is not production authentication."



Implement this local demo state flow:



initial

order_created

payment_locked

collection_confirmed

delivery_confirmed

settlement_released



The buyer should be able to:



1. Create an order

2. Review the terms

3. Fund the simulated settlement

4. Enter the delivery code

5. Confirm delivery

6. Approve the simulated release



The seller should be able to:



1. View the order

2. Confirm dispatch

3. View the locked payment

4. View the final settlement



The courier should be able to:



1. View the assigned order

2. Confirm collection

3. View the courier fee

4. View the final settlement



Block invalid actions:



1. The seller cannot claim funds while they are locked.

2. The courier cannot confirm delivery before collection is confirmed.

3. The buyer cannot release payment before collection is confirmed.

4. The delivery code cannot be used twice.

5. The settlement cannot be released twice.



Explain blocked actions clearly. For example:



"Payment remains locked because courier collection has not been confirmed."



Create a separate settlement adapter module with these functions:



1. createSettlement

2. fundSettlement

3. confirmCollection

4. confirmDelivery

5. releaseSettlement

6. requestRefund

7. getSettlementStatus



For now, implement only a local mock adapter. Clearly label its references as "Demo reference."



Add comments showing where a real BCH or XO settlement adapter can be connected later.



Create a public settlement receipt view showing:



1. Order ID

2. Item

3. Total amount

4. Seller amount

5. Courier fee

6. Settlement status

7. Confirmation history

8. Demo references

9. A notice that says:



"This prototype uses simulated settlement data. Live BCH settlement will be connected in a later integration phase."



Before finishing, verify that:



1. The app starts without errors.

2. The create order flow works.

3. The local flow moves from order creation to settlement release.

4. Invalid actions are blocked.

5. The delivery code cannot be reused.

6. Refreshing the page does not falsely claim a real payment succeeded.

7. No secrets or API keys are included.

8. No real blockchain transaction is claimed.

9. No Lovable AI service is required.

10. The interface is understandable within 20 seconds.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/eedc7647-fe90-421a-aa19-5fb3b365dfcd).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
