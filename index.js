import WebSocket, {WebSocketServer} from 'ws';

const wss = new WebSocketServer({port: 8080});
const qrClients = {}; // Object to store clients based on their unique URL - qr initiated
const stateClients = {} // Object to store clients based on their unique URL - state initiated
wss.on('connection', function connection(ws, req) {
    const ip = req.headers['x-forwarded-for'] ? req.headers['x-forwarded-for'].split(',')[0].trim() : req.socket.remoteAddress;
    console.log("New connection from: " + ip);

    // Extract the unique identifier from the URL
    const uniqueId = req.url.split('/').pop().toUpperCase();
    // Extract contact type from the URL
    const contactType = req.url.split('/')[2]
    if (!uniqueId) {
        console.log("Connection attempt without a unique ID. Closing connection.");
        ws.close();
        return;
    }
    if (contactType === "contact") {
        console.log("Type: contact")
    } else if (contactType === "connect") {
        console.log("Type: connect")
    } else {
        console.log("Connection attempt without a vaild contact type: " + contactType + " Closing connection.");
        ws.close();
        return;
    }
    ws.on('error', console.error);
    console.log(uniqueId)
    if (contactType === "connect") {
        if (!qrClients[uniqueId]) {
            // If there is no client for this uniqueId, initialize with the current client
            console.log("First client for unique ID. Waiting for a partner...");
            qrClients[uniqueId] = [ws];
        } else if (qrClients[uniqueId].length === 1) {
            // If there is one waiting client, pair them
            console.log("Paired with a partner!");
            const partnerClient = qrClients[uniqueId][0];
            qrClients[uniqueId].push(ws); // Add the current client to the pair
            console.log(qrClients[uniqueId].length);
            console.log(Object.keys(qrClients));

            // Function to forward messages between the paired clients
            const forwardMessage = (sender, receiver) => (data, isBinary) => {
                console.log(`Message received`);
                if (receiver.readyState === WebSocket.OPEN) {
                    console.log(`Forwarding message`);
                    receiver.send(data, {binary: isBinary});
                } else {
                    console.log(`Failed to forward message: receiver is not in OPEN state.`);
                }
            };

            ws.on('message', forwardMessage(ws, partnerClient));
            partnerClient.on('message', forwardMessage(partnerClient, ws));

            // Optionally handle close/errors to clean up
            const cleanup = (clientToClose, otherClient) => () => {
                console.log(`Cleaning up connection`);
                if (otherClient.readyState === WebSocket.OPEN) {
                    otherClient.close(); // Optionally close the partner or notify them
                }
                // Remove the clients from the tracking object
                delete qrClients[uniqueId];
            };

            ws.on('close', cleanup(ws, partnerClient));
            partnerClient.on('close', cleanup(partnerClient, ws));
        } else {
            // If there are already two clients connected with the same uniqueId, reject new connections
            console.log("Connection attempt to a full unique ID. Closing connection.");
            ws.close();
        }
    } else { // contact case
        const clientPayload = req.headers['x-cable-client-payload'] ? req.headers['x-cable-client-payload'] : null;
        if (clientPayload != null) { // client connected
            console.log("A client connected with clientPayload: " + clientPayload)
            if (stateClients[uniqueId]) {
                // If there is one waiting client, pair them
                console.log("Paired with a authenticator!");
                const authenticatorClient = stateClients[uniqueId][0];
                if (authenticatorClient.readyState === WebSocket.OPEN) {
                    // send payload to the authenticator
                    console.log("Send clientPayload");
                    authenticatorClient.send(clientPayload, {binary: true})
                }
                // Function to forward messages between the paired clients
                const forwardMessage = (sender, receiver) => (data, isBinary) => {
                    console.log(`Message received`);
                    if (receiver.readyState === WebSocket.OPEN) {
                        console.log(`Forwarding message`);
                        receiver.send(data, {binary: isBinary});
                    } else {
                        console.log(`Failed to forward message: receiver is not in OPEN state.`);
                    }
                };
                ws.on('message', forwardMessage(ws, authenticatorClient));
                authenticatorClient.on('message', forwardMessage(authenticatorClient, ws));

            } else {
                console.log("There isn't a authenticator connected! Please try it later...")
            }
        } else { // authenticator connected
            console.log("Authenticator connected and waiting for clients...")
            stateClients[uniqueId] = [ws];
        }
    }
});
