﻿import * as assert from "assert";
import { Base, Container, CosmosClient, DocumentBase, UriFactory } from "../../";
import { Database } from "../../client";
import testConfig from "./../common/_testConfig";
import { TestHelpers } from "./../common/TestHelpers";

const endpoint = testConfig.host;
const masterKey = testConfig.masterKey;

describe("Authorization", function () {
    this.timeout(5000);
    const client = new CosmosClient({ endpoint, auth: { masterKey } });

    // TODO: should have types for all these things
    let database: Database;
    let container: Container;

    let userReadDefinition: any = { id: "User With Read Permission" };
    let userAllDefinition: any = { id: "User With All Permission" };
    let collReadPermission: any = {
        id: "collection Read Permission",
        permissionMode: DocumentBase.PermissionMode.Read,
    };
    let collAllPermission: any = {
        id: "collection All Permission",
        permissionMode: DocumentBase.PermissionMode.All,
    };
    /************** TEST **************/

    beforeEach(async function () {
        await TestHelpers.removeAllDatabases(client);

        // create a database & container
        container = await TestHelpers.getTestContainer(client, "Authorization tests");
        database = container.database;

        // create userReadPermission
        const { result: userDef } = await container.database.users.create(userReadDefinition);
        assert.equal(userReadDefinition.id, userDef.id, "userReadPermission is not created properly");
        userReadDefinition = userDef;
        const userRead = container.database.users.getUser(userDef.id);

        // give permission to read container, to userReadPermission
        collReadPermission.resource = container.url;
        const { result: readPermission } = await userRead.permissions.create(collReadPermission);
        assert.equal(readPermission.id, collReadPermission.id, "permission to read coll1 is not created properly");
        collReadPermission = readPermission;

        // create userAllPermission
        const { result: userAllDef } = await container.database.users.create(userAllDefinition);
        assert.equal(userAllDefinition.id, userAllDef.id, "userAllPermission is not created properly");
        userAllDefinition = userAllDef;
        const userAll = container.database.users.getUser(userAllDef.id);

        // create collAllPermission
        collAllPermission.resource = container.url;
        const { result: allPermission } = await userAll.permissions.create(collAllPermission);
        assert.equal(collAllPermission.id, allPermission.id, "permission to read coll2 is not created properly");
        collAllPermission = allPermission;
    });

    afterEach(async function () {
        await TestHelpers.removeAllDatabases(client);
    });

    it("Accessing collection by resourceTokens", async function () {
        const rTokens: any = {};
        rTokens[container.id] = collReadPermission._token;

        const clientReadPermission = new CosmosClient({ endpoint, auth: { resourceTokens: rTokens } });

        const { result: coll } = await clientReadPermission.databases.getDatabase(database.id)
            .containers.getContainer(container.id)
            .read();
        assert.equal(coll.id, container.id, "invalid collection");
    });

    it("Accessing collection by permissionFeed", async function () {
        const clientReadPermission = new CosmosClient({ endpoint, auth: { permissionFeed: [collReadPermission] } });

        // self link must be used to access a resource using permissionFeed
        const { result: coll } = await clientReadPermission.databases.getDatabase(database.id)
            .containers.getContainer(container.id)
            .read();
        assert.equal(coll.id, container.id, "invalid collection");
    });

    it("Accessing collection without permission fails", async function () {
        const clientNoPermission = new CosmosClient({ endpoint, auth: null });

        try {
            await clientNoPermission.databases.getDatabase(database.id)
                .containers.getContainer(container.id)
                .read();
            assert.fail("accessing collectioni did not throw");
        } catch (err) {
            assert(err !== undefined); // TODO: should check that we get the right error message
        }
    });

    it("Accessing document by permissionFeed of parent collection", async function () {
        const { result: createdDoc } = await container.items.create({ id: "document1" });
        const clientReadPermission = new CosmosClient({ endpoint, auth: { permissionFeed: [collReadPermission] } });
        assert.equal("document1", createdDoc.id, "invalid documnet create");

        const { result: readDoc } = await clientReadPermission.databases.getDatabase(database.id)
            .containers.getContainer(container.id)
            .items.getItem(createdDoc.id)
            .read<any>();
        assert.equal(readDoc.id, createdDoc.id, "invalid document read");
    });

    it("Modifying collection by resourceTokens", async function () {
        const rTokens: any = {};
        rTokens[container.id] = collAllPermission._token;
        const clientAllPermission = new CosmosClient({ endpoint, auth: { resourceTokens: rTokens } });

        // delete collection
        return clientAllPermission.databases.getDatabase(database.id)
            .containers.getContainer(container.id)
            .delete();
    });

    it("Modifying collection by permissionFeed", async function () {
        const clientAllPermission = new CosmosClient({ endpoint, auth: { permissionFeed: [collAllPermission] } });

        // self link must be used to access a resource using permissionFeed
        // delete collection
        return clientAllPermission.databases.getDatabase(database.id)
            .containers.getContainer(container.id)
            .delete();
    });
});
