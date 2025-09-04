# Fix Book Template Creation Error

## Tasks
- [ ] Add req.body validation in createBookTemplate function
- [ ] Test the fix by running the application
- [ ] Verify that the error is resolved

## Details
The error "Cannot destructure property 'theme' of 'req.body' as it is undefined" occurs because the request body is not being parsed properly. This can happen if:
1. The client doesn't send JSON with correct Content-Type header
2. There's an issue with middleware order
3. The request body is malformed

## Solution
Add a check in the createBookTemplate function to ensure req.body exists before destructuring properties.
